export interface CombatLogCandidate {
  path: string;
  sizeBytes: number;
  modifiedAt: string;
  clientFolder: string;
}

export interface CombatLogDiscoveryProvider {
  discover(): Promise<CombatLogCandidate[]>;
}
