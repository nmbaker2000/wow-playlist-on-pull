import assert from "node:assert/strict";
import test from "node:test";
import { CombatLogTailer } from "./combatLogTailer";

type TestableCombatLogTailer = {
  emitCompleteLines(chunkText: string): void;
  emitBufferedCombatLogEvent(): void;
  readNewBytes(): Promise<void>;
  scheduleReadNewBytes(): Promise<void>;
};

test("tailer emits buffered encounter end without waiting for trailing newline", () => {
  const tailer = new CombatLogTailer("unused");
  const testable = tailer as unknown as TestableCombatLogTailer;
  const lines: string[] = [];
  tailer.on("line", (line: string) => {
    lines.push(line);
  });

  testable.emitCompleteLines('5/7 21:38:01.456  ENCOUNTER_END,3134,"Big Boss",16,20,1');
  testable.emitBufferedCombatLogEvent();

  assert.deepEqual(lines, ['5/7 21:38:01.456  ENCOUNTER_END,3134,"Big Boss",16,20,1']);
});

test("tailer keeps partial encounter events buffered", () => {
  const tailer = new CombatLogTailer("unused");
  const testable = tailer as unknown as TestableCombatLogTailer;
  const lines: string[] = [];
  tailer.on("line", (line: string) => {
    lines.push(line);
  });

  testable.emitCompleteLines('5/7 21:38:01.456  ENCOUNTER_END,3134,"Big');
  testable.emitBufferedCombatLogEvent();
  testable.emitCompleteLines(' Boss",16,20,1');
  testable.emitBufferedCombatLogEvent();

  assert.deepEqual(lines, ['5/7 21:38:01.456  ENCOUNTER_END,3134,"Big Boss",16,20,1']);
});

test("tailer coalesces overlapping file change reads", async () => {
  const tailer = new CombatLogTailer("unused");
  const testable = tailer as unknown as TestableCombatLogTailer;
  let activeReads = 0;
  let maxActiveReads = 0;
  let readCount = 0;
  let resolveRead: (() => void) | undefined;

  testable.readNewBytes = async () => {
    activeReads += 1;
    maxActiveReads = Math.max(maxActiveReads, activeReads);
    readCount += 1;
    await new Promise<void>((resolve) => {
      resolveRead = resolve;
    });
    activeReads -= 1;
  };

  const first = testable.scheduleReadNewBytes();
  const second = testable.scheduleReadNewBytes();
  const third = testable.scheduleReadNewBytes();

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(readCount, 1);
  resolveRead?.();

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(readCount, 2);
  resolveRead?.();

  await Promise.all([first, second, third]);
  assert.equal(maxActiveReads, 1);
  assert.equal(readCount, 2);
});
