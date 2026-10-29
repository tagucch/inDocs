import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export function statePath() {
  return process.env.GITHUB_DIGEST_STATE ?? path.join(os.homedir(), ".local", "state", "github-digest", "state.json");
}

export function readState() {
  try {
    return JSON.parse(readFileSync(statePath(), "utf8"));
  } catch {
    return null;
  }
}

export function writeState(state) {
  const file = statePath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
  return file;
}
