interface LocalMediaTrack {
  title: string;
  originalPath: string;
  fileUrl: string;
}

interface LocalPlayerQueueInput {
  tracks: LocalMediaTrack[];
  shuffleEnabled: boolean;
  preloadOnly: boolean;
}

const audio = document.querySelector<HTMLAudioElement>("#audio");
const title = document.querySelector<HTMLElement>("#title");
const pathText = document.querySelector<HTMLElement>("#path");
const counter = document.querySelector<HTMLElement>("#counter");
const source = document.querySelector<HTMLElement>("#source");
const queueState = document.querySelector<HTMLElement>("#queueState");
const shuffleState = document.querySelector<HTMLElement>("#shuffleState");

let queue: LocalMediaTrack[] = [];
let currentIndex = 0;
let currentShuffleEnabled = false;

function loadQueue(input: LocalPlayerQueueInput): void {
  currentShuffleEnabled = input.shuffleEnabled;
  queue = input.shuffleEnabled ? shuffleTracks(input.tracks) : [...input.tracks];
  currentIndex = 0;
  updateQueueMeta();
  loadCurrentTrack();

  if (input.preloadOnly) {
    audio?.pause();
    if (audio) {
      audio.currentTime = 0;
    }
    return;
  }

  void audio?.play();
}

function playFromStart(): void {
  currentIndex = 0;
  loadCurrentTrack();
  void audio?.play();
}

function loadCurrentTrack(): void {
  if (!audio || queue.length === 0) {
    if (title) {
      title.textContent = "No local cue loaded";
    }
    updateQueueMeta();
    return;
  }

  const track = queue[currentIndex];
  audio.src = track.fileUrl;
  audio.currentTime = 0;
  if (title) {
    title.textContent = track.title;
  }
  if (pathText) {
    pathText.textContent = track.originalPath;
  }
  if (counter) {
    counter.textContent = `${currentIndex + 1} of ${queue.length}`;
  }
  updateQueueMeta();
  audio.load();
}

function playNextTrack(): void {
  if (currentIndex >= queue.length - 1) {
    audio?.pause();
    return;
  }

  currentIndex += 1;
  loadCurrentTrack();
  void audio?.play();
}

function shuffleTracks(tracks: LocalMediaTrack[]): LocalMediaTrack[] {
  const shuffled = [...tracks];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function updateQueueMeta(): void {
  if (queueState) {
    queueState.textContent = `${queue.length} ${queue.length === 1 ? "track" : "tracks"}`;
  }

  if (shuffleState) {
    shuffleState.textContent = currentShuffleEnabled ? "On" : "Off";
  }

  if (source) {
    source.textContent = queue.length > 0 ? getSourceLabel(queue[currentIndex]?.originalPath ?? "") : "Local files";
  }
}

function getSourceLabel(filePath: string): string {
  if (!filePath) {
    return "Local files";
  }

  const normalized = filePath.replace(/\\/g, "/");
  const folder = normalized.split("/").slice(-2, -1)[0];
  return folder || "Local files";
}

audio?.addEventListener("ended", playNextTrack);

type LocalPlayerWindow = Window & {
  localMediaPlayer: {
    loadQueue(input: LocalPlayerQueueInput): void;
    playFromStart(): void;
  };
};

(window as unknown as LocalPlayerWindow).localMediaPlayer = {
  loadQueue,
  playFromStart
};
