import { app, BrowserWindow, safeStorage } from "electron";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProviderPlaylistOption } from "./types";

const YOUTUBE_READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_PLAYLISTS_URL = "https://www.googleapis.com/youtube/v3/playlists";
const TOKEN_EXPIRY_SKEW_MS = 60_000;

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
    const { code, redirectUri } = await runInstalledAppOAuthFlow(credentials.clientId, parentWindow);
    const token = await exchangeAuthorizationCode(credentials, code, redirectUri, this.fetchImpl);
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
  parentWindow: BrowserWindow | null
): Promise<{ code: string; redirectUri: string }> {
  const state = randomBytes(16).toString("hex");
  const server = createServer();
  const redirectUri = await new Promise<string>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to start OAuth callback server."));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}/oauth2callback`);
    });
  });

  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", YOUTUBE_READONLY_SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  const authWindow = new BrowserWindow({
    width: 980,
    height: 760,
    parent: parentWindow ?? undefined,
    title: "Connect YouTube Playlists",
    backgroundColor: "#0f0f0f",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const closeServer = () => {
      server.close();
    };
    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      callback();
    };

    server.on("request", (request, response) => {
      const requestUrl = new URL(request.url ?? "/", redirectUri);
      const code = requestUrl.searchParams.get("code");
      const returnedState = requestUrl.searchParams.get("state");
      const error = requestUrl.searchParams.get("error");

      response.writeHead(error ? 400 : 200, { "content-type": "text/html" });
      response.end("<html><body><p>You can close this window and return to Pull Playlist.</p></body></html>");

      closeServer();
      authWindow.close();

      if (error) {
        settle(() => reject(new Error(`Google OAuth failed: ${error}`)));
        return;
      }

      if (!code || returnedState !== state) {
        settle(() => reject(new Error("Google OAuth callback did not include a valid authorization code.")));
        return;
      }

      settle(() => resolve({ code, redirectUri }));
    });

    authWindow.on("closed", () => {
      closeServer();
      settle(() => reject(new Error("YouTube playlist-library connection was cancelled.")));
    });

    void authWindow.loadURL(authUrl.toString()).catch((error) => {
      closeServer();
      settle(() => reject(error));
    });
  });
}

async function exchangeAuthorizationCode(
  credentials: YouTubeOAuthClientCredentials,
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch
): Promise<StoredOAuthToken> {
  const body = new URLSearchParams({
    client_id: credentials.clientId,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  });
  if (credentials.clientSecret) {
    body.set("client_secret", credentials.clientSecret);
  }
  return mapTokenResponse(await postTokenRequest(body, fetchImpl));
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
