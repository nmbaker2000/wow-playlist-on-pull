type PlaylistProviderId = "youtube" | "local";
type PlaylistProviderAccountActionId = "youtube-login";

interface PlaylistRule {
  id: string;
  label: string;
  providerId: PlaylistProviderId;
  playlistUrlOrId: string;
  selection: PlaylistSelection;
  encounterId?: string;
  encounterName?: string;
  isDefault: boolean;
}

interface PlaylistRuleSettings {
  providerId: PlaylistProviderId;
  playlistUrlOrId: string;
  selection: PlaylistSelection;
}

type PlaylistSelectionSource = "manual" | "account" | "local";

interface LocalMediaSelection {
  filePaths: string[];
  folderPaths: string[];
}

interface PlaylistSelection {
  providerId: PlaylistProviderId;
  playlistId?: string;
  playlistTitle?: string;
  playlistUrlOrId: string;
  source: PlaylistSelectionSource;
  shuffleEnabled: boolean;
  localMedia?: LocalMediaSelection;
}

interface ProviderPlaylistOption {
  providerId: PlaylistProviderId;
  playlistId: string;
  playlistTitle: string;
  thumbnailUrl?: string;
  privacyStatus?: string;
  videoCount?: number;
}

interface CombatLogCandidate {
  path: string;
  sizeBytes: number;
  modifiedAt: string;
  clientFolder: string;
}

interface ProviderAccount {
  providerId: PlaylistProviderId;
  providerLabel: string;
  actionId: PlaylistProviderAccountActionId;
  label: string;
  statusLabel: string;
  actionLabel: string;
  logoutLabel: string;
  canLogout: boolean;
  signedIn: boolean;
  libraryStatusLabel?: string;
  libraryConnected?: boolean;
  libraryCanDisconnect?: boolean;
  privacyStatusLabel?: string;
  privacyStatus?: YouTubePrivacyStatus;
}

interface YouTubePrivacyStatus {
  initializationState: "pending" | "ready" | "failed";
  blockingEnabled: boolean;
  lastError: string | null;
  cacheStatus: "unknown" | "fresh" | "expired" | "rebuilt";
  blockedRequestCounts: Record<string, number>;
}

interface EncounterInfo {
  encounterId: string;
  encounterName?: string;
  difficultyId?: number;
  groupSize?: number;
}

type AppTheme = "dark" | "light";
type SettingsSection = "general" | "playlistProviders" | "defaultPlaylist" | "encounterPlaylists";

interface ProviderOption {
  id: PlaylistProviderId;
  label: string;
}

interface EncounterCatalogEntry {
  expansion: string;
  raid: string;
  bossNames: string[];
  encounterIds?: string[];
}

interface EncounterGroup {
  expansion: string;
  raid: string;
  rows: EncounterRowInput[];
}

interface EncounterRowInput {
  encounter?: EncounterInfo;
  rule?: PlaylistRule;
  manual: boolean;
}

const logPathInput = document.querySelector<HTMLInputElement>("#logPath");
const settingsLogPathInput = document.querySelector<HTMLInputElement>("#settingsLogPath");
const youtubeOAuthClientIdInput = document.querySelector<HTMLInputElement>("#youtubeOAuthClientId");
const toggleOAuthClientIdButton = document.querySelector<HTMLButtonElement>("#toggleOAuthClientId");
const youtubeOAuthClientSecretInput = document.querySelector<HTMLInputElement>("#youtubeOAuthClientSecret");
const toggleOAuthClientSecretButton = document.querySelector<HTMLButtonElement>("#toggleOAuthClientSecret");
const defaultPlaylistInput = document.querySelector<HTMLInputElement>("#defaultPlaylist");
const defaultProviderSelect = document.querySelector<HTMLSelectElement>("#defaultProvider");
const defaultPlaylistPicker = document.querySelector<HTMLSelectElement>("#defaultPlaylistPicker");
const defaultShuffleInput = document.querySelector<HTMLInputElement>("#defaultShuffle");
const defaultLocalMedia = document.querySelector<HTMLElement>("#defaultLocalMedia");
const playbackVolumeInput = document.querySelector<HTMLInputElement>("#playbackVolume");
const playbackVolumeValue = document.querySelector<HTMLOutputElement>("#playbackVolumeValue");
const preloadEnabledInput = document.querySelector<HTMLInputElement>("#preloadEnabled");
const settingsPreloadEnabledInput = document.querySelector<HTMLInputElement>("#settingsPreloadEnabled");
const statusText = document.querySelector<HTMLElement>("#statusText");
const settingsStatusText = document.querySelector<HTMLElement>("#settingsStatusText");
const readinessTitle = document.querySelector<HTMLElement>("#readinessTitle");
const readinessCopy = document.querySelector<HTMLElement>("#readinessCopy");
const watchStatePill = document.querySelector<HTMLElement>("#watchStatePill");
const logReadiness = document.querySelector<HTMLElement>("#logReadiness");
const preloadSummary = document.querySelector<HTMLElement>("#preloadSummary");
const settingsModal = document.querySelector<HTMLElement>("#settingsModal");
const openSettingsButton = document.querySelector<HTMLButtonElement>("#openSettings");
const closeSettingsButton = document.querySelector<HTMLButtonElement>("#closeSettings");
const cancelSettingsButton = document.querySelector<HTMLButtonElement>("#cancelSettings");
const settingsMenuButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-settings-section]"));
const settingsPanels = Array.from(document.querySelectorAll<HTMLElement>("[data-settings-panel]"));
const providerMenuButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-provider-section]"));
const providerPanels = Array.from(document.querySelectorAll<HTMLElement>("[data-provider-panel]"));
const themeInputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[name='theme']"));
const defaultPlaylistSummary = document.querySelector<HTMLElement>("#defaultPlaylistSummary");
const encounterPlaylistSummary = document.querySelector<HTMLElement>("#encounterPlaylistSummary");
const providerSummary = document.querySelector<HTMLElement>("#providerSummary");
const providerAccountContainers = Array.from(document.querySelectorAll<HTMLElement>("[data-provider-accounts]"));
const oauthHelpToggle = document.querySelector<HTMLButtonElement>("#oauthHelpToggle");
const oauthHelp = document.querySelector<HTMLElement>("#oauthHelp");
const encounterExpansionMenu = document.querySelector<HTMLElement>("#encounterExpansionMenu");
const encounterRows = document.querySelector<HTMLElement>("#encounterRows");
const eventList = document.querySelector<HTMLUListElement>("#eventList");
const discoveredLogs = document.querySelector<HTMLUListElement>("#discoveredLogs");
const selectLogButton = document.querySelector<HTMLButtonElement>("#selectLog");
const settingsSelectLogButton = document.querySelector<HTMLButtonElement>("#settingsSelectLog");
const discoverLogsButton = document.querySelector<HTMLButtonElement>("#discoverLogs");
const addEncounterButton = document.querySelector<HTMLButtonElement>("#addEncounter");
const startButton = document.querySelector<HTMLButtonElement>("#start");
const stopButton = document.querySelector<HTMLButtonElement>("#stop");
const testButton = document.querySelector<HTMLButtonElement>("#testPlaylist");
const saveSettingsButton = document.querySelector<HTMLButtonElement>("#saveSettings");

let isWatching = false;
let providers: ProviderOption[] = [];
let seenEncounters: EncounterInfo[] = [];
let playlistRules: PlaylistRule[] = [];
let currentProviderAccounts: ProviderAccount[] = [];
let awaitingProviderSignIn = false;
let currentTheme: AppTheme = "dark";
let activeEncounterExpansion = "";
const providerPlaylistOptions = new Map<PlaylistProviderId, ProviderPlaylistOption[]>();

const CUSTOM_ENCOUNTER_EXPANSION = "Custom";
const CUSTOM_ENCOUNTER_RAID = "Detected and manual";
const ENCOUNTER_CATALOG: EncounterCatalogEntry[] = [
  {
    expansion: "Midnight",
    raid: "Voidspire",
    bossNames: [
      "Imperator Averzian",
      "Vorasius",
      "Fallen-King Salhadaar",
      "Fallen-King Shalhadaar",
      "Vaelgor & Ezzorak",
      "Lightblinded Vanguard",
      "Crown of the Cosmos"
    ]
  },
  {
    expansion: "Midnight",
    raid: "Dreamrift",
    bossNames: ["Chimaerus", "Chimaerus the Undreamt God"]
  },
  {
    expansion: "Midnight",
    raid: "March on Quel'Danas",
    bossNames: ["Belo'ren, Child of Al'ar", "Belo'ren", "Midnight Falls", "L'ura"]
  },
  {
    expansion: "The War Within",
    raid: "Manaforge Omega",
    bossNames: [
      "Plexus Sentinel",
      "Loom'ithar",
      "Soulbinder Naazindhri",
      "Forgeweaver Araz",
      "The Soul Hunters",
      "Fractillus",
      "Nexus-King Salhadaar",
      "Dimensius, the All-Devouring"
    ]
  },
  {
    expansion: "The War Within",
    raid: "Liberation of Undermine",
    bossNames: [
      "Vexie and the Geargrinders",
      "Cauldron of Carnage",
      "Rik Reverb",
      "Stix Bunkjunker",
      "Sprocketmonger Lockenstock",
      "The One-Armed Bandit",
      "Mug'Zee, Heads of Security",
      "Chrome King Gallywix"
    ]
  },
  {
    expansion: "The War Within",
    raid: "Nerub-ar Palace",
    bossNames: [
      "Ulgrax the Devourer",
      "The Bloodbound Horror",
      "Sikran, Captain of the Sureki",
      "Sikran",
      "Rasha'nan",
      "Broodtwister Ovi'nax",
      "Eggtender Ovi'nax",
      "Nexus-Princess Ky'veza",
      "The Silken Court",
      "Queen Ansurek"
    ]
  },
  {
    expansion: "Dragonflight",
    raid: "Amirdrassil, the Dream's Hope",
    bossNames: [
      "Gnarlroot",
      "Igira the Cruel",
      "Volcoross",
      "Council of Dreams",
      "Larodar, Keeper of the Flame",
      "Nymue, Weaver of the Cycle",
      "Smolderon",
      "Tindral Sageswift, Seer of the Flame",
      "Fyrakk the Blazing"
    ]
  },
  {
    expansion: "Dragonflight",
    raid: "Aberrus, the Shadowed Crucible",
    bossNames: [
      "Kazzara, the Hellforged",
      "The Amalgamation Chamber",
      "The Forgotten Experiments",
      "Assault of the Zaqali",
      "Rashok, the Elder",
      "The Vigilant Steward, Zskarn",
      "Magmorax",
      "Echo of Neltharion",
      "Scalecommander Sarkareth"
    ]
  },
  {
    expansion: "Dragonflight",
    raid: "Vault of the Incarnates",
    bossNames: [
      "Eranog",
      "Terros",
      "The Primal Council",
      "Sennarth, The Cold Breath",
      "Dathea, Ascended",
      "Kurog Grimtotem",
      "Broodkeeper Diurna",
      "Raszageth the Storm-Eater"
    ]
  }
];

void bootstrap();

async function bootstrap(): Promise<void> {
  const state = await window.wowPullPlaylist.getState();
  providers = state.providers;
  seenEncounters = state.settings.seenEncounters;
  playlistRules = state.settings.playlistRules;
  currentTheme = state.settings.theme;

  setTheme(state.settings.theme);
  setProviderOptions(defaultProviderSelect, providers);
  setLogPath(state.settings.logPath);
  setProviderCredentials(state.settings);
  setPlaybackVolume(state.settings.playbackVolume);
  setDefaultPlaylist(state.settings.defaultPlaylist);
  void refreshConnectedPlaylistLibraries(state.providerAccounts);
  setPreloadEnabled(state.settings.preloadEnabled);
  renderProviderAccounts(state.providerAccounts);
  renderEncounterRows();
  updateSettingsSummary();
  setWatching(state.isWatching);

  openSettingsButton?.addEventListener("click", openSettingsModal);
  closeSettingsButton?.addEventListener("click", closeSettingsModal);
  cancelSettingsButton?.addEventListener("click", closeSettingsModal);
  settingsModal?.addEventListener("click", (event) => {
    if (event.target === settingsModal) {
      closeSettingsModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !settingsModal?.hidden) {
      closeSettingsModal();
    }
  });
  settingsMenuButtons.forEach((button) => {
    button.addEventListener("click", () => {
      showSettingsSection(button.dataset.settingsSection as SettingsSection);
    });
  });
  providerMenuButtons.forEach((button) => {
    button.addEventListener("click", () => {
      showProviderSection(button.dataset.providerSection as PlaylistProviderId);
    });
  });
  themeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) {
        void saveTheme(input.value as AppTheme);
      }
    });
  });
  selectLogButton?.addEventListener("click", selectLog);
  settingsSelectLogButton?.addEventListener("click", selectLog);
  discoverLogsButton?.addEventListener("click", discoverCombatLogs);
  addEncounterButton?.addEventListener("click", addManualEncounterRow);
  startButton?.addEventListener("click", startWatching);
  stopButton?.addEventListener("click", stopWatching);
  testButton?.addEventListener("click", testPlaylist);
  saveSettingsButton?.addEventListener("click", saveSettingsFromButton);
  toggleOAuthClientIdButton?.addEventListener("click", toggleYouTubeOAuthClientIdVisibility);
  toggleOAuthClientSecretButton?.addEventListener("click", toggleYouTubeOAuthClientSecretVisibility);
  oauthHelpToggle?.addEventListener("click", toggleOAuthHelp);

  window.wowPullPlaylist.onPullEvent((event) => {
    setStatus(event.type === "pull-started" ? "Pull detected" : "Pull ended");
  });

  window.wowPullPlaylist.onActivityEvent((event) => {
    addEvent(event.message, event.timestamp);
  });

  window.wowPullPlaylist.onWatchError((message) => {
    setStatus(`Log watcher error: ${message}`);
  });

  window.wowPullPlaylist.onProviderAccounts((accounts) => {
    renderProviderAccounts(accounts);
    updateSettingsSummary();
    reconcileProviderSignInStatus(accounts);
  });

  window.wowPullPlaylist.onSeenEncounters((encounters) => {
    playlistRules = collectEncounterRules({ allowEmptySeenRows: true });
    seenEncounters = encounters;
    renderEncounterRows();
    updateSettingsSummary();
  });
}

async function selectLog(): Promise<void> {
  const logPath = await window.wowPullPlaylist.selectLog();
  setLogPath(logPath);
}

function showView(view: "dashboard" | "settings"): void {
  if (view === "settings") {
    openSettingsModal();
  } else {
    closeSettingsModal();
  }
}

function openSettingsModal(): void {
  if (!settingsModal) {
    return;
  }

  settingsModal.hidden = false;
  document.body.classList.add("modal-open");
  showSettingsSection("general");
}

function closeSettingsModal(): void {
  if (!settingsModal) {
    return;
  }

  settingsModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function showSettingsSection(section: SettingsSection): void {
  settingsMenuButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.settingsSection === section);
  });
  settingsPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.settingsPanel === section);
  });
}

function showProviderSection(providerId: PlaylistProviderId): void {
  providerMenuButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.providerSection === providerId);
  });
  providerPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.providerPanel === providerId);
  });
}

async function discoverCombatLogs(): Promise<void> {
  if (!discoveredLogs || !discoverLogsButton) {
    return;
  }

  discoverLogsButton.disabled = true;
  discoveredLogs.innerHTML = '<li class="muted">Searching common Windows install folders...</li>';

  try {
    const candidates = await window.wowPullPlaylist.discoverCombatLogs();
    renderDiscoveredLogs(candidates);
  } catch (error) {
    discoveredLogs.innerHTML = "";
    setStatus(error instanceof Error ? error.message : String(error));
  } finally {
    discoverLogsButton.disabled = false;
  }
}

async function startWatching(): Promise<void> {
  try {
    await saveSettings();
    await window.wowPullPlaylist.startWatching();
    setWatching(true);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }
}

async function stopWatching(): Promise<void> {
  await window.wowPullPlaylist.stopWatching();
  setWatching(false);
}

async function testPlaylist(): Promise<void> {
  try {
    await saveSettings();
    setStatus("Firing test cue");
    await window.wowPullPlaylist.testPlaylist();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }
}

async function openProviderAccount(actionId: PlaylistProviderAccountActionId): Promise<void> {
  try {
    awaitingProviderSignIn = true;
    const accounts = await window.wowPullPlaylist.openProviderAccount(actionId);
    renderProviderAccounts(accounts);
    setStatus("Use the provider window to finish signing in");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }
}

async function clearProviderAccount(providerId: PlaylistProviderId): Promise<void> {
  try {
    const accounts = await window.wowPullPlaylist.clearProviderAccount(providerId);
    renderProviderAccounts(accounts);
    setStatus("Provider account signed out");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }
}

async function connectProviderLibrary(providerId: PlaylistProviderId): Promise<void> {
  try {
    await saveProviderCredentials();
    await window.wowPullPlaylist.connectProviderLibrary(providerId);
    await refreshProviderPlaylists(providerId);
    renderProviderAccounts(await getFreshProviderAccounts());
    renderDefaultPlaylistPicker(getDefaultPlaylistSettings().selection);
    renderEncounterRows();
    updateSettingsSummary();
    setStatus("Cue library connected");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }
}

async function refreshProviderPlaylists(providerId: PlaylistProviderId): Promise<void> {
  try {
    const playlists = await window.wowPullPlaylist.listProviderPlaylists(providerId);
    providerPlaylistOptions.set(providerId, playlists);
    renderDefaultPlaylistPicker(getDefaultPlaylistSettings().selection);
    renderEncounterRows();
    setStatus(
      playlists.length > 0
        ? `${getProviderLabel(providerId)} cues loaded`
        : `No ${getProviderLabel(providerId)} playlists found`
    );
  } catch (error) {
    providerPlaylistOptions.delete(providerId);
    renderDefaultPlaylistPicker(getDefaultPlaylistSettings().selection);
    renderEncounterRows();
    setStatus(error instanceof Error ? error.message : String(error));
  }
}

async function disconnectProviderLibrary(providerId: PlaylistProviderId): Promise<void> {
  try {
    await window.wowPullPlaylist.disconnectProviderLibrary(providerId);
    providerPlaylistOptions.delete(providerId);
    renderProviderAccounts(await getFreshProviderAccounts());
    renderDefaultPlaylistPicker(getDefaultPlaylistSettings().selection);
    renderEncounterRows();
    updateSettingsSummary();
    setStatus("Cue library disconnected");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }
}

async function refreshConnectedPlaylistLibraries(accounts: ProviderAccount[]): Promise<void> {
  await Promise.all(
    accounts
      .filter((account) => account.libraryConnected)
      .map((account) => refreshProviderPlaylists(account.providerId))
  );
}

async function getFreshProviderAccounts(): Promise<ProviderAccount[]> {
  const state = await window.wowPullPlaylist.getState();
  return state.providerAccounts;
}

async function saveSettingsFromButton(): Promise<void> {
  try {
    await saveProviderCredentials();
    await saveSettings();
    updateSettingsSummary();
    setStatus("Control settings saved");
    closeSettingsModal();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }
}

async function saveTheme(theme: AppTheme): Promise<void> {
  const previousTheme = currentTheme;
  setTheme(theme);

  try {
    currentTheme = await window.wowPullPlaylist.setTheme(theme);
    setTheme(currentTheme);
  } catch (error) {
    setTheme(previousTheme);
    setStatus(error instanceof Error ? error.message : String(error));
  }
}

function setTheme(theme: AppTheme): void {
  currentTheme = theme;
  document.documentElement.dataset.theme = theme;

  themeInputs.forEach((input) => {
    input.checked = input.value === theme;
  });
}

async function saveSettings(): Promise<void> {
  const defaultPlaylist = getDefaultPlaylistSettings();
  if (!hasConfiguredPlaylistSelection(defaultPlaylist.selection)) {
    if (defaultPlaylist.providerId === "local") {
      throw new Error("Select at least one local audio file or folder.");
    }
    throw new Error("Add a default playlist URL or ID.");
  }

  playlistRules = collectEncounterRules({ allowEmptySeenRows: false });
  await window.wowPullPlaylist.saveSettings({
    defaultPlaylist,
    playlistRules,
    preloadEnabled: getPreloadEnabled()
  });
  updateSettingsSummary();
}

function getDefaultPlaylistSettings(): PlaylistRuleSettings {
  const providerId = (defaultProviderSelect?.value ?? "youtube") as PlaylistProviderId;
  if (providerId === "local") {
    const selection = createLocalMediaSelection(getLocalMediaSelection(defaultLocalMedia), defaultShuffleInput?.checked ?? false);
    return {
      providerId: selection.providerId,
      playlistUrlOrId: "",
      selection
    };
  }

  const pickerValue = defaultPlaylistPicker?.value ?? "";
  const option = pickerValue ? findProviderPlaylistOption(providerId, pickerValue) : undefined;
  const manualValue = defaultPlaylistInput?.value ?? "";
  const selection = option
    ? createAccountSelection(option, defaultShuffleInput?.checked ?? false)
    : createManualSelection(providerId, manualValue, defaultShuffleInput?.checked ?? false);

  return {
    providerId: selection.providerId,
    playlistUrlOrId: selection.playlistUrlOrId,
    selection
  };
}

function collectEncounterRules(options: { allowEmptySeenRows: boolean }): PlaylistRule[] {
  if (!encounterRows) {
    return [];
  }

  const rows = Array.from(encounterRows.querySelectorAll<HTMLElement>(".encounter-row"));
  return rows.flatMap((row) => {
    const encounterId = row.querySelector<HTMLInputElement>("[data-field='encounterId']")?.value.trim();
    const encounterName = row
      .querySelector<HTMLInputElement>("[data-field='encounterName']")
      ?.value.trim();
    const providerId = (row.querySelector<HTMLSelectElement>("[data-field='providerId']")?.value ??
      "youtube") as PlaylistProviderId;
    const playlistUrlOrId = row
      .querySelector<HTMLInputElement>("[data-field='playlistUrlOrId']")
      ?.value.trim();
    const pickerValue = row.querySelector<HTMLSelectElement>("[data-field='playlistPicker']")?.value ?? "";
    const option = pickerValue ? findProviderPlaylistOption(providerId, pickerValue) : undefined;
    const shuffleEnabled =
      row.querySelector<HTMLInputElement>("[data-field='shuffleEnabled']")?.checked ?? false;
    const selection = providerId === "local"
      ? createLocalMediaSelection(getLocalMediaSelection(row.querySelector<HTMLElement>("[data-field='localMedia']")), shuffleEnabled)
      : option
        ? createAccountSelection(option, shuffleEnabled)
        : createManualSelection(providerId, playlistUrlOrId ?? "", shuffleEnabled);

    if (!hasConfiguredPlaylistSelection(selection)) {
      return [];
    }

    if (!encounterId && !encounterName && !options.allowEmptySeenRows) {
      throw new Error("Each encounter playlist needs an encounter ID or name.");
    }

    const label = encounterName || encounterId || "Encounter playlist";
    return [
      {
        id: row.dataset.ruleId || createRuleId(),
        label,
        providerId: selection.providerId,
        playlistUrlOrId: selection.playlistUrlOrId,
        selection,
        encounterId: encounterId || undefined,
        encounterName: encounterName || undefined,
        isDefault: false
      }
    ];
  });
}

function renderProviderAccounts(accounts: ProviderAccount[]): void {
  currentProviderAccounts = accounts;

  if (providerAccountContainers.length === 0) {
    return;
  }

  providerAccountContainers.forEach((container) => {
    container.innerHTML = "";
  });

  providerAccountContainers.forEach((container) => {
    const providerId = container.dataset.providerAccounts as PlaylistProviderId | undefined;
    accounts
      .filter((account) => !providerId || account.providerId === providerId)
      .forEach((account) => {
        container.append(createProviderAccountItem(account));
      });
  });
}

function createProviderAccountItem(account: ProviderAccount): HTMLElement {
  const item = document.createElement("div");
  item.className = "provider-account";

  const copy = document.createElement("div");
  const label = document.createElement("span");
  label.textContent = account.label;
  const status = document.createElement("strong");
  status.textContent = account.statusLabel;
  const detail = document.createElement("small");
  const details = [
    `${account.providerLabel} playback: ${account.statusLabel}`,
    `Library: ${account.libraryStatusLabel ?? "not available"}`
  ];
  if (account.privacyStatusLabel) {
    details.push(account.privacyStatusLabel);
  }
  detail.textContent = `${details.join(". ")}.`;
  copy.append(label, status, detail);

  const actions = document.createElement("div");
  actions.className = "provider-account-actions";

  const signInButton = document.createElement("button");
  signInButton.type = "button";
  signInButton.textContent = account.actionLabel;
  signInButton.addEventListener("click", () => {
    void openProviderAccount(account.actionId);
  });

  const logoutButton = document.createElement("button");
  logoutButton.type = "button";
  logoutButton.textContent = account.logoutLabel;
  logoutButton.disabled = !account.canLogout;
  logoutButton.addEventListener("click", () => {
    void clearProviderAccount(account.providerId);
  });

  const libraryButton = document.createElement("button");
  libraryButton.type = "button";
  libraryButton.textContent = account.libraryConnected ? "Refresh playlists" : "Connect playlists";
  libraryButton.addEventListener("click", () => {
    void (account.libraryConnected
      ? refreshProviderPlaylists(account.providerId)
      : connectProviderLibrary(account.providerId));
  });

  const disconnectLibraryButton = document.createElement("button");
  disconnectLibraryButton.type = "button";
  disconnectLibraryButton.textContent = "Disconnect library";
  disconnectLibraryButton.disabled = !account.libraryCanDisconnect;
  disconnectLibraryButton.addEventListener("click", () => {
    void disconnectProviderLibrary(account.providerId);
  });

  actions.append(signInButton, logoutButton);
  if (account.libraryStatusLabel) {
    actions.append(libraryButton, disconnectLibraryButton);
  }
  item.append(copy, actions);
  return item;
}

function reconcileProviderSignInStatus(accounts: ProviderAccount[]): void {
  if (!awaitingProviderSignIn) {
    return;
  }

  awaitingProviderSignIn = false;
  setStatus(accounts.some((account) => account.signedIn) ? "Provider account signed in" : "Provider sign-in closed");
}

function renderEncounterRows(): void {
  if (!encounterRows) {
    return;
  }

  encounterRows.innerHTML = "";
  if (encounterExpansionMenu) {
    encounterExpansionMenu.innerHTML = "";
  }

  const rulesByEncounterId = new Map(
    playlistRules.filter((rule) => rule.encounterId).map((rule) => [rule.encounterId, rule])
  );
  const rowInputs: EncounterRowInput[] = [];

  for (const encounter of seenEncounters) {
    const rule = rulesByEncounterId.get(encounter.encounterId);
    rowInputs.push({ encounter, rule, manual: false });
  }

  for (const rule of playlistRules) {
    if (!rule.encounterId || !seenEncounters.some((encounter) => encounter.encounterId === rule.encounterId)) {
      rowInputs.push({ rule, manual: true });
    }
  }

  if (rowInputs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted empty-cue-state";
    empty.textContent = "No boss cues assigned yet. Default playlist will fire for every pull.";
    encounterRows.append(empty);
    return;
  }

  const groups = groupEncounterRows(rowInputs);
  const expansions = Array.from(new Set(groups.map((group) => group.expansion)));
  if (!activeEncounterExpansion || !expansions.includes(activeEncounterExpansion)) {
    activeEncounterExpansion = expansions[0] ?? CUSTOM_ENCOUNTER_EXPANSION;
  }

  for (const expansion of expansions) {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.toggle("active", expansion === activeEncounterExpansion);
    button.textContent = expansion;
    button.addEventListener("click", () => {
      activeEncounterExpansion = expansion;
      renderEncounterRows();
    });
    encounterExpansionMenu?.append(button);
  }

  for (const group of groups) {
    const raidPanel = document.createElement("section");
    raidPanel.className = "encounter-raid-panel";
    raidPanel.dataset.expansion = group.expansion;
    raidPanel.dataset.raid = group.raid;
    raidPanel.hidden = group.expansion !== activeEncounterExpansion;

    const heading = document.createElement("div");
    heading.className = "encounter-raid-heading";
    const title = document.createElement("h3");
    title.textContent = group.raid;
    const count = document.createElement("span");
    count.textContent = `${group.rows.length} ${group.rows.length === 1 ? "boss" : "bosses"}`;
    heading.append(title, count);

    const header = document.createElement("div");
    header.className = "encounter-header";
    ["Boss", "Route", "Cue", "Shuffle", ""].forEach((label) => {
      const item = document.createElement("span");
      item.textContent = label;
      header.append(item);
    });

    const rowList = document.createElement("div");
    rowList.className = "encounter-rows";
    group.rows.forEach((rowInput) => {
      rowList.append(createEncounterRow(rowInput));
    });

    raidPanel.append(heading, header, rowList);
    encounterRows.append(raidPanel);
  }
}

function groupEncounterRows(rowInputs: EncounterRowInput[]): EncounterGroup[] {
  const groups = new Map<string, EncounterGroup>();

  for (const rowInput of rowInputs) {
    const metadata = getEncounterMetadata(rowInput);
    const key = `${metadata.expansion}\n${metadata.raid}`;
    let group = groups.get(key);
    if (!group) {
      group = { ...metadata, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(rowInput);
  }

  return Array.from(groups.values()).sort((left, right) => {
    const leftExpansionIndex = getExpansionSortIndex(left.expansion);
    const rightExpansionIndex = getExpansionSortIndex(right.expansion);
    if (leftExpansionIndex !== rightExpansionIndex) {
      return leftExpansionIndex - rightExpansionIndex;
    }

    const leftRaidIndex = getRaidSortIndex(left.expansion, left.raid);
    const rightRaidIndex = getRaidSortIndex(right.expansion, right.raid);
    if (leftRaidIndex !== rightRaidIndex) {
      return leftRaidIndex - rightRaidIndex;
    }

    return left.raid.localeCompare(right.raid);
  });
}

function getEncounterMetadata(rowInput: EncounterRowInput): Pick<EncounterGroup, "expansion" | "raid"> {
  const encounterId = rowInput.rule?.encounterId ?? rowInput.encounter?.encounterId ?? "";
  const encounterName = rowInput.rule?.encounterName ?? rowInput.encounter?.encounterName ?? "";
  const normalizedName = normalizeCatalogName(encounterName);
  const match = ENCOUNTER_CATALOG.find((entry) => {
    return (
      Boolean(encounterId && entry.encounterIds?.includes(encounterId)) ||
      entry.bossNames.some((bossName) => normalizeCatalogName(bossName) === normalizedName)
    );
  });

  return match
    ? { expansion: match.expansion, raid: match.raid }
    : { expansion: CUSTOM_ENCOUNTER_EXPANSION, raid: CUSTOM_ENCOUNTER_RAID };
}

function getExpansionSortIndex(expansion: string): number {
  if (expansion === CUSTOM_ENCOUNTER_EXPANSION) {
    return Number.MAX_SAFE_INTEGER;
  }

  const index = ENCOUNTER_CATALOG.findIndex((entry) => entry.expansion === expansion);
  return index === -1 ? Number.MAX_SAFE_INTEGER - 1 : index;
}

function getRaidSortIndex(expansion: string, raid: string): number {
  if (raid === CUSTOM_ENCOUNTER_RAID) {
    return Number.MAX_SAFE_INTEGER;
  }

  const index = ENCOUNTER_CATALOG.findIndex(
    (entry) => entry.expansion === expansion && entry.raid === raid
  );
  return index === -1 ? Number.MAX_SAFE_INTEGER - 1 : index;
}

function normalizeCatalogName(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function createEncounterRow(input: EncounterRowInput): HTMLElement {
  const row = document.createElement("div");
  row.className = "encounter-row";
  row.dataset.ruleId = input.rule?.id ?? createRuleId();

  const encounterCell = document.createElement("div");
  encounterCell.className = "encounter-fields";
  const nameInput = createInput("Boss name", input.rule?.encounterName ?? input.encounter?.encounterName ?? "");
  nameInput.dataset.field = "encounterName";
  const idInput = createInput("Encounter ID", input.rule?.encounterId ?? input.encounter?.encounterId ?? "");
  idInput.dataset.field = "encounterId";
  if (!input.manual && input.encounter?.encounterId) {
    idInput.readOnly = true;
  }
  encounterCell.append(nameInput, idInput);

  const providerSelect = document.createElement("select");
  providerSelect.dataset.field = "providerId";
  setProviderOptions(providerSelect, providers);
  providerSelect.value = input.rule?.providerId ?? "youtube";

  const playlistInput = createInput("Cue URL, ID, or playlist name", input.rule?.playlistUrlOrId ?? "");
  playlistInput.dataset.field = "playlistUrlOrId";
  const playlistChoice = document.createElement("div");
  playlistChoice.className = "playlist-choice";
  const playlistPicker = document.createElement("select");
  playlistPicker.dataset.field = "playlistPicker";
  const currentSelection = input.rule?.selection ?? createManualSelection(providerSelect.value as PlaylistProviderId, playlistInput.value, false);
  const localMediaControls = createLocalMediaControls(currentSelection.localMedia);
  localMediaControls.dataset.field = "localMedia";
  renderPlaylistPicker(playlistPicker, providerSelect.value as PlaylistProviderId, currentSelection);
  playlistPicker.addEventListener("change", () => {
    const option = findProviderPlaylistOption(providerSelect.value as PlaylistProviderId, playlistPicker.value);
    if (option) {
      playlistInput.value = option.playlistId;
      updateSettingsSummary();
    }
  });
  providerSelect.addEventListener("change", () => {
    renderPlaylistPicker(playlistPicker, providerSelect.value as PlaylistProviderId, currentSelection);
    updatePlaylistSourceVisibility(providerSelect.value as PlaylistProviderId, playlistPicker, playlistInput, localMediaControls);
    updateRowShuffleAvailability();
    updateSettingsSummary();
  });
  playlistInput.addEventListener("input", () => {
    playlistPicker.value = "";
    updateSettingsSummary();
  });
  playlistChoice.append(playlistPicker, playlistInput, localMediaControls);
  updatePlaylistSourceVisibility(providerSelect.value as PlaylistProviderId, playlistPicker, playlistInput, localMediaControls);

  const shuffleLabel = document.createElement("label");
  shuffleLabel.className = "toggle-row";
  const shuffleInput = document.createElement("input");
  shuffleInput.type = "checkbox";
  shuffleInput.dataset.field = "shuffleEnabled";
  shuffleInput.checked = Boolean(input.rule?.selection?.shuffleEnabled);
  const shuffleText = document.createElement("span");
  shuffleText.textContent = "Shuffle";
  shuffleLabel.append(shuffleInput, shuffleText);
  const updateRowShuffleAvailability = () => {
    const supportsShuffle = providerSupportsShuffle(providerSelect.value as PlaylistProviderId);
    shuffleInput.disabled = !supportsShuffle;
    if (!supportsShuffle) {
      shuffleInput.checked = false;
    }
  };

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.textContent = input.manual ? "Remove" : "Clear";
  removeButton.addEventListener("click", () => {
    if (input.manual) {
      row.remove();
      updateSettingsSummary();
      return;
    }

    playlistInput.value = "";
    playlistPicker.value = "";
    setLocalMediaSelection(localMediaControls, { filePaths: [], folderPaths: [] });
    updateSettingsSummary();
  });

  row.append(encounterCell, providerSelect, playlistChoice, shuffleLabel, removeButton);
  updateRowShuffleAvailability();
  return row;
}

function addManualEncounterRow(): void {
  if (!encounterRows) {
    return;
  }

  activeEncounterExpansion = CUSTOM_ENCOUNTER_EXPANSION;
  const emptyMessage = encounterRows.querySelector(".muted");
  emptyMessage?.remove();

  encounterRows.querySelectorAll<HTMLElement>(".encounter-raid-panel").forEach((panel) => {
    panel.hidden = panel.dataset.expansion !== CUSTOM_ENCOUNTER_EXPANSION;
  });
  encounterExpansionMenu?.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.textContent === CUSTOM_ENCOUNTER_EXPANSION);
  });

  let customButton = Array.from(encounterExpansionMenu?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
    (button) => button.textContent === CUSTOM_ENCOUNTER_EXPANSION
  );
  if (!customButton && encounterExpansionMenu) {
    customButton = document.createElement("button");
    customButton.type = "button";
    customButton.className = "active";
    customButton.textContent = CUSTOM_ENCOUNTER_EXPANSION;
    customButton.addEventListener("click", () => {
      activeEncounterExpansion = CUSTOM_ENCOUNTER_EXPANSION;
      renderEncounterRows();
    });
    encounterExpansionMenu.append(customButton);
  }

  const rowList = getOrCreateCustomEncounterRowList();
  rowList.append(createEncounterRow({ manual: true }));
  updateSettingsSummary();
}

function getOrCreateCustomEncounterRowList(): HTMLElement {
  const existing = encounterRows?.querySelector<HTMLElement>(
    `.encounter-raid-panel[data-expansion="${CUSTOM_ENCOUNTER_EXPANSION}"] .encounter-rows`
  );
  if (existing) {
    return existing;
  }

  const raidPanel = document.createElement("section");
  raidPanel.className = "encounter-raid-panel";
  raidPanel.dataset.expansion = CUSTOM_ENCOUNTER_EXPANSION;
  raidPanel.dataset.raid = CUSTOM_ENCOUNTER_RAID;

  const heading = document.createElement("div");
  heading.className = "encounter-raid-heading";
  const title = document.createElement("h3");
  title.textContent = CUSTOM_ENCOUNTER_RAID;
  const count = document.createElement("span");
  count.textContent = "Manual bosses";
  heading.append(title, count);

  const header = document.createElement("div");
  header.className = "encounter-header";
  ["Boss", "Route", "Cue", "Shuffle", ""].forEach((label) => {
    const item = document.createElement("span");
    item.textContent = label;
    header.append(item);
  });

  const rowList = document.createElement("div");
  rowList.className = "encounter-rows";
  raidPanel.append(heading, header, rowList);
  encounterRows?.append(raidPanel);
  return rowList;
}

function updateSettingsSummary(): void {
  const defaultSelection = getDefaultPlaylistSettings().selection;
  if (defaultPlaylistSummary) {
    defaultPlaylistSummary.textContent = getPlaylistDisplayName(defaultSelection) || "Not configured";
  }

  if (encounterPlaylistSummary) {
    const configuredCount = collectEncounterRules({ allowEmptySeenRows: true }).length;
    encounterPlaylistSummary.textContent = `${configuredCount} ${configuredCount === 1 ? "cue" : "cues"}`;
  }

  if (providerSummary) {
    providerSummary.textContent = getProviderLabel(defaultSelection.providerId);
  }

  if (preloadSummary) {
    preloadSummary.textContent = getPreloadEnabled() ? "Priming enabled" : "Manual fire";
  }

  updateReadinessPanel();
}

function createInput(placeholder: string, value: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.value = value;
  return input;
}

function setProviderOptions(
  select: HTMLSelectElement | null,
  providerOptions: Array<{ id: PlaylistProviderId; label: string }>
): void {
  if (!select) {
    return;
  }

  select.innerHTML = "";

  for (const provider of providerOptions) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.label;
    select.append(option);
  }
}

function setLogPath(logPath: string | null): void {
  if (logPathInput) {
    logPathInput.value = logPath ?? "";
  }

  if (settingsLogPathInput) {
    settingsLogPathInput.value = logPath ?? "";
  }

  updateReadinessPanel();
}

function setProviderCredentials(settings: {
  youtubeOAuthClientId: string;
  youtubeOAuthClientSecret: string;
}): void {
  if (youtubeOAuthClientIdInput) {
    youtubeOAuthClientIdInput.value = settings.youtubeOAuthClientId;
  }
  if (youtubeOAuthClientSecretInput) {
    youtubeOAuthClientSecretInput.value = settings.youtubeOAuthClientSecret;
  }
}

async function saveProviderCredentials(): Promise<void> {
  await window.wowPullPlaylist.saveOAuthCredentials({
    youtubeOAuthClientId: youtubeOAuthClientIdInput?.value ?? "",
    youtubeOAuthClientSecret: youtubeOAuthClientSecretInput?.value ?? ""
  });
}

function toggleYouTubeOAuthClientIdVisibility(): void {
  toggleSecretInput(youtubeOAuthClientIdInput, toggleOAuthClientIdButton);
}

function toggleYouTubeOAuthClientSecretVisibility(): void {
  toggleSecretInput(youtubeOAuthClientSecretInput, toggleOAuthClientSecretButton);
}

function toggleSecretInput(input: HTMLInputElement | null, button: HTMLButtonElement | null): void {
  if (!input || !button) {
    return;
  }

  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  button.textContent = isHidden ? "Hide" : "Show";
}

function toggleOAuthHelp(): void {
  toggleHelpPanel(oauthHelp, oauthHelpToggle);
}

function toggleHelpPanel(panel: HTMLElement | null, toggle: HTMLButtonElement | null): void {
  if (!panel || !toggle) {
    return;
  }

  const nextHidden = !panel.hidden;
  panel.hidden = nextHidden;
  toggle.setAttribute("aria-expanded", String(!nextHidden));
}

function setDefaultPlaylist(defaultPlaylist: PlaylistRuleSettings): void {
  if (defaultProviderSelect) {
    defaultProviderSelect.value = defaultPlaylist.providerId;
  }

  if (defaultPlaylistInput) {
    defaultPlaylistInput.value = defaultPlaylist.playlistUrlOrId;
    defaultPlaylistInput.addEventListener("input", updateSettingsSummary);
  }

  if (defaultLocalMedia) {
    setLocalMediaSelection(defaultLocalMedia, defaultPlaylist.selection.localMedia ?? { filePaths: [], folderPaths: [] });
    bindLocalMediaControls(defaultLocalMedia);
  }

  if (defaultShuffleInput) {
    defaultShuffleInput.checked = Boolean(defaultPlaylist.selection?.shuffleEnabled);
    defaultShuffleInput.addEventListener("change", updateSettingsSummary);
  }

  defaultProviderSelect?.addEventListener("change", () => {
    renderDefaultPlaylistPicker(getDefaultPlaylistSettings().selection);
    updateDefaultPlaylistSourceVisibility();
    updateDefaultShuffleAvailability();
    updateSettingsSummary();
  });
  defaultPlaylistPicker?.addEventListener("change", () => {
    const providerId = (defaultProviderSelect?.value ?? "youtube") as PlaylistProviderId;
    const option = findProviderPlaylistOption(providerId, defaultPlaylistPicker.value);
    if (option && defaultPlaylistInput) {
      defaultPlaylistInput.value = option.playlistId;
    }
    updateSettingsSummary();
  });
  renderDefaultPlaylistPicker(defaultPlaylist.selection);
  updateDefaultPlaylistSourceVisibility();
  updateDefaultShuffleAvailability();
}

function renderDiscoveredLogs(candidates: CombatLogCandidate[]): void {
  if (!discoveredLogs) {
    return;
  }

  discoveredLogs.innerHTML = "";

  if (candidates.length === 0) {
    const item = document.createElement("li");
    item.className = "muted";
    item.textContent = "No combat logs found in common Windows locations.";
    discoveredLogs.append(item);
    return;
  }

  for (const candidate of candidates) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "log-candidate";

    const title = document.createElement("strong");
    title.textContent = candidate.clientFolder;
    const path = document.createElement("span");
    path.textContent = candidate.path;
    const details = document.createElement("small");
    details.textContent = `${formatBytes(candidate.sizeBytes)} - ${formatDate(candidate.modifiedAt)}`;
    button.append(title, path, details);

    button.addEventListener("click", async () => {
      const logPath = await window.wowPullPlaylist.setLogPath(candidate.path);
      setLogPath(logPath);
      clearDiscoveredLogs();
      setStatus("Log feed linked");
    });

    item.append(button);
    discoveredLogs.append(item);
  }
}

function clearDiscoveredLogs(): void {
  if (!discoveredLogs) {
    return;
  }

  discoveredLogs.innerHTML = "";
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function setPreloadEnabled(preloadEnabled: boolean): void {
  if (preloadEnabledInput) {
    preloadEnabledInput.checked = preloadEnabled;
    preloadEnabledInput.addEventListener("change", () => {
      if (settingsPreloadEnabledInput) {
        settingsPreloadEnabledInput.checked = preloadEnabledInput.checked;
      }
      updateSettingsSummary();
    });
  }

  if (settingsPreloadEnabledInput) {
    settingsPreloadEnabledInput.checked = preloadEnabled;
    settingsPreloadEnabledInput.addEventListener("change", () => {
      if (preloadEnabledInput) {
        preloadEnabledInput.checked = settingsPreloadEnabledInput.checked;
      }
      updateSettingsSummary();
    });
  }

  updateSettingsSummary();
}

function getPreloadEnabled(): boolean {
  return settingsPreloadEnabledInput?.checked ?? preloadEnabledInput?.checked ?? true;
}

function setPlaybackVolume(volume: number): void {
  if (!playbackVolumeInput) {
    return;
  }

  playbackVolumeInput.value = String(Math.round(normalizeVolume(volume) * 100));
  updatePlaybackVolumeValue();
  playbackVolumeInput.addEventListener("input", () => {
    const nextVolume = getPlaybackVolume();
    updatePlaybackVolumeValue();
    updateSettingsSummary();
    void window.wowPullPlaylist.setPlaybackVolume(nextVolume).catch((error) => {
      setStatus(error instanceof Error ? error.message : String(error));
    });
  });
}

function getPlaybackVolume(): number {
  if (!playbackVolumeInput) {
    return 1;
  }

  return normalizeVolume(Number(playbackVolumeInput.value) / 100);
}

function updatePlaybackVolumeValue(): void {
  if (playbackVolumeValue) {
    playbackVolumeValue.value = `${Math.round(getPlaybackVolume() * 100)}%`;
  }
}

function normalizeVolume(volume: number): number {
  if (!Number.isFinite(volume)) {
    return 1;
  }

  return Math.min(1, Math.max(0, volume));
}

function setWatching(nextIsWatching: boolean): void {
  isWatching = nextIsWatching;
  setStatus(isWatching ? "Standing by for pull" : "Standing by");

  if (startButton) {
    startButton.disabled = isWatching;
  }

  if (stopButton) {
    stopButton.disabled = !isWatching;
  }

  updateReadinessPanel();
}

function setStatus(message: string): void {
  const displayMessage = normalizeStatusMessage(message);
  if (statusText) {
    statusText.textContent = displayMessage;
  }

  if (settingsStatusText) {
    settingsStatusText.textContent = displayMessage;
  }

  updateReadinessPanel(displayMessage);
}

function addEvent(message: string, timestamp: string): void {
  if (!eventList) {
    return;
  }

  const eventType = getTimelineEventType(message);
  const item = document.createElement("li");
  item.dataset.eventType = eventType;
  const time = document.createElement("span");
  time.className = "event-time";
  time.textContent = timestamp;
  const badge = document.createElement("span");
  badge.className = "event-badge";
  badge.textContent = getTimelineEventLabel(message, eventType);
  const copy = document.createElement("strong");
  copy.textContent = normalizeActivityMessage(message);
  item.append(time, badge, copy);
  eventList.prepend(item);

  while (eventList.children.length > 8) {
    eventList.lastElementChild?.remove();
  }
}

function updateReadinessPanel(statusMessage = statusText?.textContent ?? "Standing by"): void {
  const hasLog = Boolean((logPathInput?.value || settingsLogPathInput?.value || "").trim());
  const defaultSelection = getDefaultPlaylistSettings().selection;
  const hasPlaylist = hasConfiguredPlaylistSelection(defaultSelection);

  if (logReadiness) {
    logReadiness.textContent = hasLog ? "Feed linked" : "Needs log";
  }

  if (preloadSummary) {
    preloadSummary.textContent = getPreloadEnabled() ? "Priming enabled" : "Manual fire";
  }

  if (watchStatePill) {
    watchStatePill.textContent = isWatching ? "Armed" : "Standing by";
    watchStatePill.dataset.state = isWatching ? "armed" : "idle";
  }

  if (!readinessTitle || !readinessCopy) {
    return;
  }

  const lowerStatus = statusMessage.toLocaleLowerCase();
  if (lowerStatus.includes("pull detected") || lowerStatus.includes("playlist live")) {
    readinessTitle.textContent = "Playlist live";
    readinessCopy.textContent = "The pull is active. Your configured cue is firing for this encounter.";
    return;
  }

  if (isWatching) {
    readinessTitle.textContent = "Watcher armed";
    readinessCopy.textContent = hasPlaylist
      ? "Combat log is live. The next boss pull will trigger the selected cue."
      : "Combat log is live, but no default cue is configured yet.";
    return;
  }

  if (!hasLog || !hasPlaylist) {
    readinessTitle.textContent = "Ready the control deck";
    readinessCopy.textContent = !hasLog
      ? "Link your active WoW combat log before arming pull watch."
      : "Assign a default cue so every pull has music ready.";
    return;
  }

  readinessTitle.textContent = "Stand by for the pull";
  readinessCopy.textContent = "Log feed and default cue are ready. Arm the watcher before the next boss.";
}

function normalizeStatusMessage(message: string): string {
  if (message === "Idle") {
    return "Standing by";
  }

  if (message.includes("Watching for raid boss pulls")) {
    return "Standing by for pull";
  }

  if (message.includes("Raid boss pull detected")) {
    return "Pull detected";
  }

  if (message.includes("Raid boss pull ended")) {
    return "Pull ended";
  }

  return message;
}

function normalizeActivityMessage(message: string): string {
  if (message === "Watching combat log") {
    return "Log feed armed";
  }

  if (message === "Stopped watching") {
    return "Watcher stood down";
  }

  if (message === "Playlist ready") {
    return "Default cue primed";
  }

  if (message === "Preloading playlist") {
    return "Priming default cue";
  }

  if (message === "Playlist started") {
    return "Playlist live";
  }

  if (message === "Playlist stopped") {
    return "Cue stopped";
  }

  return message;
}

function getTimelineEventType(message: string): string {
  const lower = message.toLocaleLowerCase();
  if (lower.includes("warning") || lower.includes("error")) {
    return "warning";
  }
  if (lower.includes("pull detected") || lower.includes("pull started") || lower.includes("playlist started")) {
    return "pull";
  }
  if (lower.includes("ready") || lower.includes("preloading") || lower.includes("armed") || lower.includes("watching")) {
    return "ready";
  }
  return "system";
}

function getTimelineEventLabel(message: string, eventType: string): string {
  const lower = message.toLocaleLowerCase();
  if (lower.includes("watching combat log")) {
    return "Log armed";
  }
  if (lower.includes("pull detected")) {
    return "Pull started";
  }
  if (lower.includes("pull ended")) {
    return "Pull ended";
  }
  if (lower.includes("ready") || lower.includes("preloading")) {
    return "Cue primed";
  }
  if (lower.includes("playlist started") || lower.includes("local media started")) {
    return "Cue live";
  }
  if (lower.includes("selected combat log")) {
    return "Log linked";
  }
  if (eventType === "warning") {
    return "Warning";
  }
  return "System";
}

function createRuleId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function summarizePlaylist(value: string): string {
  if (value.length <= 34) {
    return value;
  }

  return `${value.slice(0, 31)}...`;
}

function renderDefaultPlaylistPicker(selection: PlaylistSelection): void {
  if (!defaultPlaylistPicker || !defaultProviderSelect) {
    return;
  }

  renderPlaylistPicker(defaultPlaylistPicker, defaultProviderSelect.value as PlaylistProviderId, selection);
}

function renderPlaylistPicker(
  select: HTMLSelectElement,
  providerId: PlaylistProviderId,
  selection?: PlaylistSelection
): void {
  if (providerId === "local") {
    select.innerHTML = "";
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Local files and folders";
    select.append(option);
    select.disabled = true;
    return;
  }

  select.disabled = false;
  const options = providerPlaylistOptions.get(providerId) ?? [];
  select.innerHTML = "";

  const manualOption = document.createElement("option");
  manualOption.value = "";
  manualOption.textContent = getManualPlaylistOptionLabel(providerId, options.length);
  select.append(manualOption);

  if (
    selection?.source === "account" &&
    selection.providerId === providerId &&
    selection.playlistId &&
    !options.some((option) => option.playlistId === selection.playlistId)
  ) {
    const savedOption = document.createElement("option");
    savedOption.value = selection.playlistId;
    savedOption.textContent = selection.playlistTitle ?? selection.playlistId;
    select.append(savedOption);
  }

  for (const option of options) {
    const item = document.createElement("option");
    item.value = option.playlistId;
    item.textContent = option.playlistTitle;
    select.append(item);
  }

  select.value = selection?.source === "account" && selection.providerId === providerId ? selection.playlistId ?? "" : "";
}

function getManualPlaylistOptionLabel(providerId: PlaylistProviderId, optionCount: number): string {
  if (providerId === "local") {
    return "Local files and folders";
  }

  if (optionCount > 0) {
    return "Manual URL or ID";
  }

  return "Connect playlist library to pick from account";
}

function updateDefaultShuffleAvailability(): void {
  if (!defaultShuffleInput) {
    return;
  }

  const supportsShuffle = providerSupportsShuffle((defaultProviderSelect?.value ?? "youtube") as PlaylistProviderId);
  defaultShuffleInput.disabled = !supportsShuffle;
  if (!supportsShuffle) {
    defaultShuffleInput.checked = false;
  }
}

function findProviderPlaylistOption(
  providerId: PlaylistProviderId,
  playlistId: string
): ProviderPlaylistOption | undefined {
  return providerPlaylistOptions.get(providerId)?.find((option) => option.playlistId === playlistId);
}

function createAccountSelection(
  option: ProviderPlaylistOption,
  shuffleEnabled: boolean
): PlaylistSelection {
  return {
    providerId: option.providerId,
    playlistId: option.playlistId,
    playlistTitle: option.playlistTitle,
    playlistUrlOrId: option.playlistId,
    source: "account",
    shuffleEnabled: providerSupportsShuffle(option.providerId) && shuffleEnabled
  };
}

function createManualSelection(
  providerId: PlaylistProviderId,
  playlistUrlOrId: string,
  shuffleEnabled: boolean
): PlaylistSelection {
  return {
    providerId,
    playlistUrlOrId,
    source: "manual",
    shuffleEnabled: providerSupportsShuffle(providerId) && shuffleEnabled
  };
}

function createLocalMediaSelection(
  localMedia: LocalMediaSelection,
  shuffleEnabled: boolean
): PlaylistSelection {
  return {
    providerId: "local",
    playlistUrlOrId: "",
    source: "local",
    shuffleEnabled,
    localMedia
  };
}

function getPlaylistDisplayName(selection: PlaylistSelection): string {
  if (selection.providerId === "local") {
    return getLocalMediaSummary(selection.localMedia ?? { filePaths: [], folderPaths: [] });
  }

  return summarizePlaylist(selection.playlistTitle || selection.playlistUrlOrId || selection.playlistId || "");
}

function getProviderLabel(providerId: PlaylistProviderId): string {
  return providers.find((provider) => provider.id === providerId)?.label ?? providerId;
}

function providerSupportsShuffle(providerId: PlaylistProviderId): boolean {
  return providerId === "youtube" || providerId === "local";
}

function hasConfiguredPlaylistSelection(selection: PlaylistSelection): boolean {
  if (selection.providerId === "local") {
    const localMedia = selection.localMedia ?? { filePaths: [], folderPaths: [] };
    return localMedia.filePaths.length > 0 || localMedia.folderPaths.length > 0;
  }

  return Boolean(selection.playlistUrlOrId || selection.playlistId);
}

function updateDefaultPlaylistSourceVisibility(): void {
  if (!defaultPlaylistPicker || !defaultPlaylistInput || !defaultLocalMedia) {
    return;
  }

  updatePlaylistSourceVisibility(
    (defaultProviderSelect?.value ?? "youtube") as PlaylistProviderId,
    defaultPlaylistPicker,
    defaultPlaylistInput,
    defaultLocalMedia
  );
}

function updatePlaylistSourceVisibility(
  providerId: PlaylistProviderId,
  playlistPicker: HTMLSelectElement,
  playlistInput: HTMLInputElement,
  localMediaControls: HTMLElement
): void {
  const isLocal = providerId === "local";
  const pickerContainer = playlistPicker.closest("label") ?? playlistPicker;
  const inputContainer = playlistInput.closest("label") ?? playlistInput;
  pickerContainer.toggleAttribute("hidden", isLocal);
  inputContainer.toggleAttribute("hidden", isLocal);
  localMediaControls.hidden = !isLocal;
}

function createLocalMediaControls(selection?: LocalMediaSelection): HTMLElement {
  const controls = document.createElement("div");
  controls.className = "local-media-controls";

  const label = document.createElement("span");
  label.textContent = "Local sources";
  const summary = document.createElement("strong");
  summary.dataset.localSummary = "";
  const actions = document.createElement("div");

  for (const [action, text] of [
    ["files", "Add files"],
    ["folder", "Add folder"],
    ["clear", "Clear"]
  ] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.localAction = action;
    button.textContent = text;
    actions.append(button);
  }

  controls.append(label, summary, actions);
  bindLocalMediaControls(controls);
  setLocalMediaSelection(controls, selection ?? { filePaths: [], folderPaths: [] });
  return controls;
}

function bindLocalMediaControls(controls: HTMLElement): void {
  controls.querySelectorAll<HTMLButtonElement>("[data-local-action]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", async () => {
      const action = button.dataset.localAction;
      if (action === "clear") {
        setLocalMediaSelection(controls, { filePaths: [], folderPaths: [] });
        updateSettingsSummary();
        return;
      }

      if (action !== "files" && action !== "folder") {
        return;
      }

      try {
        const selection = await window.wowPullPlaylist.selectLocalMedia(action, getLocalMediaSelection(controls));
        setLocalMediaSelection(controls, selection);
        updateSettingsSummary();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
  });
}

function getLocalMediaSelection(container: HTMLElement | null): LocalMediaSelection {
  if (!container?.dataset.localMedia) {
    return { filePaths: [], folderPaths: [] };
  }

  try {
    const parsed = JSON.parse(container.dataset.localMedia) as Partial<LocalMediaSelection>;
    return {
      filePaths: Array.isArray(parsed.filePaths) ? parsed.filePaths : [],
      folderPaths: Array.isArray(parsed.folderPaths) ? parsed.folderPaths : []
    };
  } catch {
    return { filePaths: [], folderPaths: [] };
  }
}

function setLocalMediaSelection(container: HTMLElement, selection: LocalMediaSelection): void {
  container.dataset.localMedia = JSON.stringify(selection);
  const summary = container.querySelector<HTMLElement>("[data-local-summary]");
  if (summary) {
    summary.textContent = getLocalMediaSummary(selection);
  }
}

function getLocalMediaSummary(selection: LocalMediaSelection): string {
  const parts = [
    formatCount(selection.filePaths.length, "file"),
    formatCount(selection.folderPaths.length, "folder")
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "None selected";
}

function formatCount(count: number, label: string): string {
  if (count === 0) {
    return "";
  }

  return `${count} ${label}${count === 1 ? "" : "s"}`;
}
