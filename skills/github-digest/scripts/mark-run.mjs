#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { readState, writeState } from "./state.mjs";

const { values } = parseArgs({ options: { data: { type: "string" }, slug: { type: "string" } } });
if (!values.data) {
  console.error("usage: node mark-run.mjs --data digest.json [--slug <slug>]");
  process.exit(1);
}

const data = JSON.parse(readFileSync(values.data, "utf8"));
const end = new Date(data.window.end);
const state = readState();
if (state?.lastRunAt && new Date(state.lastRunAt) >= end) {
  console.error(`記録済みの ${state.lastRunAt} より前の期間なので記録は進めません（${data.window.label}）`);
  process.exit(0);
}
const file = writeState({
  lastRunAt: end.toISOString(),
  lastWindow: data.window.label,
  lastSlug: values.slug ?? null,
  recordedAt: new Date().toISOString(),
});
console.error(`${file}: lastRunAt = ${end.toISOString()}`);
