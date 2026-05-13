export type PullEventType = "pull-started" | "pull-ended";

export interface PullEvent {
  type: PullEventType;
  timestamp: string;
  encounterId?: string;
  encounterName?: string;
  difficultyId?: number;
  groupSize?: number;
  rawLine: string;
}

const RETAIL_RAID_DIFFICULTY_IDS = new Set([14, 15, 16, 17]);

export class PullDetector {
  private inPull = false;
  private activeEncounterId: string | null = null;

  acceptLine(line: string): PullEvent | null {
    if (!isEncounterLine(line)) {
      return null;
    }

    const parsed = parseCombatLogLine(line);
    if (!parsed) {
      return null;
    }

    if (parsed.eventName === "ENCOUNTER_START") {
      if (this.inPull) {
        return null;
      }

      const encounterId = parsed.fields[0];
      const encounterName = stripQuotes(parsed.fields[1]);
      const difficultyId = parseNumericField(parsed.fields[2]);
      const groupSize = parseNumericField(parsed.fields[3]);
      if (!isRetailRaidDifficulty(difficultyId)) {
        return null;
      }

      this.inPull = true;
      this.activeEncounterId = encounterId ?? null;
      return {
        type: "pull-started",
        timestamp: parsed.timestamp,
        encounterId,
        encounterName,
        difficultyId,
        groupSize: groupSize ?? undefined,
        rawLine: line
      };
    }

    if (parsed.eventName === "ENCOUNTER_END") {
      if (!this.inPull) {
        return null;
      }

      const encounterId = parsed.fields[0];
      if (this.activeEncounterId && encounterId !== this.activeEncounterId) {
        return null;
      }

      this.inPull = false;
      this.activeEncounterId = null;
      return {
        type: "pull-ended",
        timestamp: parsed.timestamp,
        encounterId,
        encounterName: stripQuotes(parsed.fields[1]),
        difficultyId: parseNumericField(parsed.fields[2]) ?? undefined,
        groupSize: parseNumericField(parsed.fields[3]) ?? undefined,
        rawLine: line
      };
    }

    return null;
  }
}

function isEncounterLine(line: string): boolean {
  return line.includes("  ENCOUNTER_START,") || line.includes("  ENCOUNTER_END,");
}

interface ParsedCombatLogLine {
  timestamp: string;
  eventName: string;
  fields: string[];
}

export function parseCombatLogLine(line: string): ParsedCombatLogLine | null {
  const separatorIndex = line.indexOf("  ");
  if (separatorIndex === -1) {
    return null;
  }

  const timestamp = line.slice(0, separatorIndex).trim();
  const payload = line.slice(separatorIndex).trim();
  const fields = splitCsvPayload(payload);
  const eventName = fields.shift();

  if (!timestamp || !eventName) {
    return null;
  }

  return { timestamp, eventName, fields };
}

function splitCsvPayload(payload: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < payload.length; index += 1) {
    const char = payload[index];

    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }

    if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current.trim());
  return fields;
}

function stripQuotes(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.replace(/^"|"$/g, "");
}

function parseNumericField(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRetailRaidDifficulty(difficultyId: number | null): difficultyId is number {
  return difficultyId !== null && RETAIL_RAID_DIFFICULTY_IDS.has(difficultyId);
}
