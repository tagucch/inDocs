#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { pages: { type: "string" }, project: { type: "string", default: "GitHub 朝刊" } } });
if (!values.pages) {
  console.error("usage: node last-digest.mjs --pages <indocs list --json の出力> [--project <プロジェクト名>]");
  process.exit(1);
}

const SLUG = /^github-digest-(\d{4})-(\d{2})-(\d{2})(?:-(\d{4})-(\d{2})-(\d{2})|-(\d{2})(\d{2}))?$/;

function windowEnd(slug) {
  const m = SLUG.exec(slug);
  if (!m) return null;
  const [, y, mo, d, y2, mo2, d2, hh, mm] = m;
  if (y2) return new Date(Number(y2), Number(mo2) - 1, Number(d2) + 1);
  if (hh) return new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm));
  return new Date(Number(y), Number(mo) - 1, Number(d) + 1);
}

const pages = JSON.parse(readFileSync(values.pages, "utf8"));
const ends = pages
  .filter((page) => page.project === values.project)
  .map((page) => windowEnd(page.slug))
  .filter((date) => date && !Number.isNaN(date.getTime()));

if (!ends.length) {
  console.error(`「${values.project}」の朝刊が見つからないので起点は fetch.mjs の既定（直近 24 時間）になります`);
  process.exit(0);
}
const latest = new Date(Math.max(...ends.map((date) => date.getTime())));
console.error(`起点: 登録済みの最新の朝刊の終端 ${latest.toISOString()}`);
process.stdout.write(latest.toISOString());
