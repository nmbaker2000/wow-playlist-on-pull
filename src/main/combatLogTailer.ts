import { EventEmitter } from "node:events";
import { createReadStream, promises as fsPromises, watch as watchFile } from "node:fs";
import { parseCombatLogLine } from "./pullDetector";

const MAX_REMAINDER_LENGTH = 1_000_000;

export interface CombatLogTailerEvents {
  line: [line: string];
  error: [error: Error];
}

export declare interface CombatLogTailer {
  on<T extends keyof CombatLogTailerEvents>(
    event: T,
    listener: (...args: CombatLogTailerEvents[T]) => void
  ): this;
}

export class CombatLogTailer extends EventEmitter {
  private offset = 0;
  private remainder = "";
  private watcher: ReturnType<typeof watchFile> | null = null;
  private isReading = false;
  private hasPendingRead = false;

  constructor(private readonly logPath: string) {
    super();
  }

  async start(): Promise<void> {
    const stats = await fsPromises.stat(this.logPath);
    this.offset = stats.size;

    this.watcher = watchFile(this.logPath, (eventType) => {
      if (eventType !== "change") {
        return;
      }

      void this.scheduleReadNewBytes();
    });
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  private async scheduleReadNewBytes(): Promise<void> {
    this.hasPendingRead = true;
    if (this.isReading) {
      return;
    }

    this.isReading = true;
    try {
      while (this.hasPendingRead) {
        this.hasPendingRead = false;
        await this.readNewBytes();
      }
    } catch (error) {
      this.emit("error", error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.isReading = false;
    }
  }

  private async readNewBytes(): Promise<void> {
    const stats = await fsPromises.stat(this.logPath);

    if (stats.size < this.offset) {
      this.offset = 0;
      this.remainder = "";
    }

    if (stats.size === this.offset) {
      return;
    }

    const stream = createReadStream(this.logPath, {
      start: this.offset,
      end: stats.size - 1,
      encoding: "utf8"
    });

    for await (const chunk of stream) {
      this.emitCompleteLines(chunk);
    }

    this.emitBufferedCombatLogEvent();
    this.offset = stats.size;
  }

  private emitCompleteLines(chunkText: string): void {
    const text = this.remainder + chunkText;
    const lines = text.split(/\r?\n/);
    this.remainder = lines.pop() ?? "";
    if (this.remainder.length > MAX_REMAINDER_LENGTH) {
      this.remainder = this.remainder.slice(-MAX_REMAINDER_LENGTH);
    }

    for (const line of lines) {
      if (line.trim()) {
        this.emit("line", line);
      }
    }
  }

  private emitBufferedCombatLogEvent(): void {
    if (!this.remainder.trim() || !isCompleteCombatLogEvent(this.remainder)) {
      return;
    }

    this.emit("line", this.remainder);
    this.remainder = "";
  }
}

function isCompleteCombatLogEvent(line: string): boolean {
  const parsed = parseCombatLogLine(line);
  if (!parsed) {
    return false;
  }

  return (
    (parsed.eventName === "ENCOUNTER_START" && parsed.fields.length >= 4) ||
    (parsed.eventName === "ENCOUNTER_END" && parsed.fields.length >= 5)
  );
}
