import assert from "node:assert/strict";
import test from "node:test";
import { PullDetector, parseCombatLogLine } from "./pullDetector";

test("parses combat log event names and quoted fields", () => {
  const parsed = parseCombatLogLine(
    '5/7 21:32:18.123  ENCOUNTER_START,3134,"Big Boss",16,20'
  );

  assert.equal(parsed?.eventName, "ENCOUNTER_START");
  assert.deepEqual(parsed?.fields, ["3134", '"Big Boss"', "16", "20"]);
});

test("emits pull started for retail raid encounter start", () => {
  const detector = new PullDetector();
  const event = detector.acceptLine(
    '5/7 21:32:18.123  ENCOUNTER_START,3134,"Big Boss",16,20'
  );

  assert.equal(event?.type, "pull-started");
  assert.equal(event?.encounterId, "3134");
  assert.equal(event?.encounterName, "Big Boss");
  assert.equal(event?.difficultyId, 16);
  assert.equal(event?.groupSize, 20);
});

test("does not emit duplicate pull starts while already in a pull", () => {
  const detector = new PullDetector();
  detector.acceptLine('5/7 21:32:18.123  ENCOUNTER_START,3134,"Big Boss",16,20');

  const duplicate = detector.acceptLine(
    '5/7 21:32:19.123  ENCOUNTER_START,3134,"Big Boss",16,20'
  );

  assert.equal(duplicate, null);
});

test("ignores dungeon encounter starts", () => {
  const detector = new PullDetector();
  const event = detector.acceptLine(
    '5/7 21:32:18.123  ENCOUNTER_START,3134,"Dungeon Boss",2,5'
  );

  assert.equal(event, null);
});

test("ignores hostile damage trash pulls", () => {
  const detector = new PullDetector();
  const event = detector.acceptLine(
    '5/7 21:32:18.123  SPELL_DAMAGE,Player-1,"Hero",1297,0,Creature-1,"Target",64,0,123,"Spell",1,10,0,1,0,0,0,nil,nil,nil'
  );

  assert.equal(event, null);
});

test("skips huge non-encounter lines before CSV parsing", () => {
  const detector = new PullDetector();
  const hugeCombatantInfo = `5/7 21:32:18.123  COMBATANT_INFO,${"1,".repeat(100_000)}`;

  assert.equal(detector.acceptLine(hugeCombatantInfo), null);
});

test("emits pull ended for matching raid encounter end", () => {
  const detector = new PullDetector();
  detector.acceptLine('5/7 21:32:18.123  ENCOUNTER_START,3134,"Big Boss",16,20');

  const event = detector.acceptLine(
    '5/7 21:38:01.456  ENCOUNTER_END,3134,"Big Boss",16,20,1'
  );

  assert.equal(event?.type, "pull-ended");
  assert.equal(event?.encounterId, "3134");
});

test("ignores encounter end for a different active encounter", () => {
  const detector = new PullDetector();
  detector.acceptLine('5/7 21:32:18.123  ENCOUNTER_START,3134,"Big Boss",16,20');

  const event = detector.acceptLine(
    '5/7 21:38:01.456  ENCOUNTER_END,9999,"Other Boss",16,20,1'
  );

  assert.equal(event, null);
});

test("allows a new pull after matching encounter end", () => {
  const detector = new PullDetector();
  detector.acceptLine('5/7 21:32:18.123  ENCOUNTER_START,3134,"Big Boss",16,20');
  detector.acceptLine('5/7 21:38:01.456  ENCOUNTER_END,3134,"Big Boss",16,20,1');

  const nextPull = detector.acceptLine(
    '5/7 21:40:18.123  ENCOUNTER_START,3135,"Bigger Boss",17,25'
  );

  assert.equal(nextPull?.type, "pull-started");
  assert.equal(nextPull?.encounterName, "Bigger Boss");
});
