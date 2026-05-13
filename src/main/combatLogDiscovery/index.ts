import type { CombatLogCandidate, CombatLogDiscoveryProvider } from "./types";
import { WindowsCombatLogDiscoveryProvider } from "./windowsCombatLogDiscovery";

export function getCombatLogDiscoveryProvider(
  platform: NodeJS.Platform = process.platform
): CombatLogDiscoveryProvider {
  if (platform === "win32") {
    return new WindowsCombatLogDiscoveryProvider();
  }

  return {
    async discover() {
      return [];
    }
  };
}

export type { CombatLogCandidate, CombatLogDiscoveryProvider };
