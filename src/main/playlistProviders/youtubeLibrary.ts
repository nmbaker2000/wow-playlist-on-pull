import { app, safeStorage, shell } from "electron";
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { BrowserWindow } from "electron";
import type { ProviderPlaylistOption } from "./types";

const YOUTUBE_READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_PLAYLISTS_URL = "https://www.googleapis.com/youtube/v3/playlists";
const TOKEN_EXPIRY_SKEW_MS = 60_000;
const OAUTH_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

interface StoredOAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
  tokenType?: string;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export interface YouTubeOAuthPkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

export interface YouTubeOAuthCallbackServer {
  redirectUri: string;
  waitForCode: Promise<string>;
  close: () => Promise<void>;
}

interface YouTubePlaylistListResponse {
  nextPageToken?: string;
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
    contentDetails?: {
      itemCount?: number;
    };
    status?: {
      privacyStatus?: string;
    };
  }>;
  error?: {
    message?: string;
    status?: string;
  };
}

export interface YouTubeLibraryState {
  connected: boolean;
  statusLabel: string;
  canDisconnect: boolean;
  reconnectRequired: boolean;
}

export interface YouTubeOAuthClientCredentials {
  clientId: string;
  clientSecret?: string;
}

export class YouTubeOAuthTokenStore {
  private tokenPath?: string;

  constructor(tokenPath?: string) {
    this.tokenPath = tokenPath;
  }

  async read(): Promise<StoredOAuthToken | null> {
    try {
      const encrypted = Buffer.from(await readFile(this.getTokenPath(), "utf8"), "base64");
      const decrypted = safeStorage.decryptString(encrypted);
      return JSON.parse(decrypted) as StoredOAuthToken;
    } catch {
      return null;
    }
  }

  async write(token: StoredOAuthToken): Promise<void> {
    if (token.refreshToken && !safeStorage.isEncryptionAvailable()) {
      throw new Error(
        "Secure token storage is unavailable on this computer, so YouTube playlist-library refresh tokens will not be saved."
      );
    }

    const tokenPath = this.getTokenPath();
    await mkdir(path.dirname(tokenPath), { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify(token));
    await writeFile(tokenPath, encrypted.toString("base64"), "utf8");
  }

  async clear(): Promise<void> {
    await rm(this.getTokenPath(), { force: true });
  }

  private getTokenPath(): string {
    this.tokenPath ??= path.join(app.getPath("userData"), "youtube-oauth-token.enc");
    return this.tokenPath;
  }
}

export class YouTubePlaylistLibrary {
  private clientCredentialsProvider = getClientCredentialsFromEnvironment;

  constructor(
    private readonly tokenStore = new YouTubeOAuthTokenStore(),
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  setClientCredentialsProvider(clientCredentialsProvider: () => YouTubeOAuthClientCredentials): void {
    this.clientCredentialsProvider = clientCredentialsProvider;
  }

  async getState(): Promise<YouTubeLibraryState> {
    const token = await this.tokenStore.read();

    if (!token?.refreshToken) {
      return {
        connected: false,
        statusLabel: "Playlist library not connected",
        canDisconnect: false,
        reconnectRequired: false
      };
    }

    return {
      connected: true,
      statusLabel: "Playlist library connected",
      canDisconnect: true,
      reconnectRequired: false
    };
  }

  async connect(parentWindow: BrowserWindow | null): Promise<YouTubeLibraryState> {
    const credentials = this.clientCredentialsProvider();
    const { code, redirectUri, codeVerifier } = await runInstalledAppOAuthFlow(credentials.clientId, parentWindow);
    const token = await exchangeAuthorizationCode(credentials, code, redirectUri, codeVerifier, this.fetchImpl);
    await this.tokenStore.write(token);
    return this.getState();
  }

  async disconnect(): Promise<YouTubeLibraryState> {
    await this.tokenStore.clear();
    return this.getState();
  }

  async listAccountPlaylists(): Promise<ProviderPlaylistOption[]> {
    const accessToken = await this.getFreshAccessToken();
    const playlists: ProviderPlaylistOption[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(YOUTUBE_PLAYLISTS_URL);
      url.searchParams.set("part", "snippet,contentDetails,status");
      url.searchParams.set("mine", "true");
      url.searchParams.set("maxResults", "50");
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await this.fetchImpl(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      const body = (await response.json()) as YouTubePlaylistListResponse;

      if (!response.ok) {
        throw new Error(body.error?.message ?? "YouTube playlist library needs to be reconnected.");
      }

      playlists.push(...mapPlaylistItems(body));
      pageToken = body.nextPageToken;
    } while (pageToken);

    return playlists;
  }

  private async getFreshAccessToken(): Promise<string> {
    const token = await this.tokenStore.read();
    if (!token?.refreshToken) {
      throw new Error("Connect your YouTube playlist library before choosing account playlists.");
    }

    if (token.accessToken && token.expiresAt > Date.now() + TOKEN_EXPIRY_SKEW_MS) {
      return token.accessToken;
    }

    try {
      const refreshed = await refreshAccessToken(
        this.clientCredentialsProvider(),
        token.refreshToken,
        this.fetchImpl
      );
      await this.tokenStore.write({
        ...refreshed,
        refreshToken: refreshed.refreshToken ?? token.refreshToken
      });
      return refreshed.accessToken;
    } catch (error) {
      await this.tokenStore.clear();
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`YouTube playlist library needs to be reconnected. ${detail}`);
    }
  }
}

async function runInstalledAppOAuthFlow(
  clientId: string,
  _parentWindow: BrowserWindow | null
): Promise<{ code: string; redirectUri: string; codeVerifier: string }> {
  const state = randomBytes(16).toString("hex");
  const pkce = createYouTubeOAuthPkcePair();
  const callbackServer = await createYouTubeOAuthCallbackServer(state, OAUTH_CALLBACK_TIMEOUT_MS);
  const authUrl = buildYouTubeAuthorizationUrl({
    clientId,
    redirectUri: callbackServer.redirectUri,
    state,
    codeChallenge: pkce.codeChallenge
  });

  try {
    await shell.openExternal(authUrl.toString());
    const code = await callbackServer.waitForCode;
    return { code, redirectUri: callbackServer.redirectUri, codeVerifier: pkce.codeVerifier };
  } catch (error) {
    await callbackServer.close();
    throw error;
  }
}

async function exchangeAuthorizationCode(
  credentials: YouTubeOAuthClientCredentials,
  code: string,
  redirectUri: string,
  codeVerifier: string,
  fetchImpl: typeof fetch
): Promise<StoredOAuthToken> {
  const body = buildYouTubeAuthorizationCodeTokenBody({
    credentials,
    code,
    redirectUri,
    codeVerifier
  });
  return mapTokenResponse(await postTokenRequest(body, fetchImpl));
}

export function createYouTubeOAuthPkcePair(randomBytesImpl: typeof randomBytes = randomBytes): YouTubeOAuthPkcePair {
  const codeVerifier = base64UrlEncode(randomBytesImpl(32));
  const codeChallenge = base64UrlEncode(createHash("sha256").update(codeVerifier).digest());

  return { codeVerifier, codeChallenge };
}

export function buildYouTubeAuthorizationUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): URL {
  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", options.clientId);
  authUrl.searchParams.set("redirect_uri", options.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", YOUTUBE_READONLY_SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", options.state);
  authUrl.searchParams.set("code_challenge", options.codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return authUrl;
}

export function buildYouTubeAuthorizationCodeTokenBody(options: {
  credentials: YouTubeOAuthClientCredentials;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): URLSearchParams {
  const body = new URLSearchParams({
    client_id: options.credentials.clientId,
    code: options.code,
    code_verifier: options.codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: options.redirectUri
  });
  if (options.credentials.clientSecret) {
    body.set("client_secret", options.credentials.clientSecret);
  }
  return body;
}

export async function createYouTubeOAuthCallbackServer(
  expectedState: string,
  timeoutMs = OAUTH_CALLBACK_TIMEOUT_MS
): Promise<YouTubeOAuthCallbackServer> {
  const server = createServer();
  const redirectUri = await new Promise<string>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo | null;
      if (!address) {
        reject(new Error("Unable to start OAuth callback server."));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}/oauth2callback`);
    });
  });

  let timeout: NodeJS.Timeout | undefined;
  let settled = false;
  const close = () =>
    new Promise<void>((resolve) => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      server.close(() => resolve());
    });

  const waitForCode = new Promise<string>((resolve, reject) => {
    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      void close().then(callback);
    };

    timeout = setTimeout(() => {
      settle(() => reject(new Error("Google OAuth callback timed out.")));
    }, timeoutMs);

    server.on("request", (request, response) => {
      const requestUrl = new URL(request.url ?? "/", redirectUri);
      const code = requestUrl.searchParams.get("code");
      const returnedState = requestUrl.searchParams.get("state");
      const error = requestUrl.searchParams.get("error");
      const isCallbackPath = requestUrl.pathname === "/oauth2callback";

      response.writeHead(error || !isCallbackPath || !code || returnedState !== expectedState ? 400 : 200, {
        "connection": "close",
        "content-type": "text/html"
      });
      response.end("<html><body><p>You can close this window and return to Pull Playlist.</p></body></html>");

      if (!isCallbackPath) {
        settle(() => reject(new Error("Google OAuth callback used an invalid path.")));
        return;
      }

      if (error) {
        settle(() => reject(new Error(`Google OAuth failed: ${error}`)));
        return;
      }

      if (!code || returnedState !== expectedState) {
        settle(() => reject(new Error("Google OAuth callback did not include a valid authorization code.")));
        return;
      }

      settle(() => resolve(code));
    });
  });

  return { redirectUri, waitForCode, close };
}

function base64UrlEncode(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function refreshAccessToken(
  credentials: YouTubeOAuthClientCredentials,
  refreshToken: string,
  fetchImpl: typeof fetch
): Promise<StoredOAuthToken> {
  const body = new URLSearchParams({
    client_id: credentials.clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
  if (credentials.clientSecret) {
    body.set("client_secret", credentials.clientSecret);
  }
  return mapTokenResponse(await postTokenRequest(body, fetchImpl));
}

async function postTokenRequest(body: URLSearchParams, fetchImpl: typeof fetch): Promise<GoogleTokenResponse> {
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  const tokenResponse = (await response.json()) as GoogleTokenResponse;

  if (!response.ok || tokenResponse.error) {
    throw new Error(tokenResponse.error_description ?? tokenResponse.error ?? "Google OAuth token request failed.");
  }

  return tokenResponse;
}

function mapTokenResponse(tokenResponse: GoogleTokenResponse): StoredOAuthToken {
  return {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt: Date.now() + (tokenResponse.expires_in ?? 3600) * 1000,
    scope: tokenResponse.scope,
    tokenType: tokenResponse.token_type
  };
}

function mapPlaylistItems(body: YouTubePlaylistListResponse): ProviderPlaylistOption[] {
  return (body.items ?? []).map((item) => ({
    providerId: "youtube",
    playlistId: item.id,
    playlistTitle: item.snippet?.title ?? item.id,
    thumbnailUrl:
      item.snippet?.thumbnails?.medium?.url ??
      item.snippet?.thumbnails?.default?.url ??
      item.snippet?.thumbnails?.high?.url,
    privacyStatus: item.status?.privacyStatus,
    videoCount: item.contentDetails?.itemCount
  }));
}

function getClientCredentialsFromEnvironment(): YouTubeOAuthClientCredentials {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("Add a YouTube OAuth Client ID in Settings before connecting your playlist library.");
  }

  return {
    clientId,
    clientSecret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim() || undefined
  };
}
