import type { WowPullPlaylistApi } from "../main/preload";

declare global {
  interface Window {
    wowPullPlaylist: WowPullPlaylistApi;
  }
}
