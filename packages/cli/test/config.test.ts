import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireConfig } from "../src/config.ts";

const saved = {
  baseUrl: "https://file.example.com",
  token: "file-token",
  deviceId: "dev_1",
  deviceName: "mac",
  email: "me@example.com",
};

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "indocs-config-"));
  vi.stubEnv("INDOCS_CONFIG_DIR", dir);
  vi.stubEnv("INDOCS_TOKEN", undefined);
  vi.stubEnv("INDOCS_URL", undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("requireConfig", () => {
  it("INDOCS_TOKEN と INDOCS_URL があれば config.json なしで認証情報を返す", async () => {
    vi.stubEnv("INDOCS_TOKEN", "env-token");
    vi.stubEnv("INDOCS_URL", "https://env.example.com/");
    expect(await requireConfig()).toEqual({ baseUrl: "https://env.example.com", token: "env-token" });
  });

  it("INDOCS_TOKEN だけでは接続先が分からないので失敗する", async () => {
    vi.stubEnv("INDOCS_TOKEN", "env-token");
    await expect(requireConfig()).rejects.toThrow("INDOCS_URL");
  });

  it("config.json があっても INDOCS_TOKEN を優先する", async () => {
    await writeFile(path.join(dir, "config.json"), JSON.stringify(saved));
    vi.stubEnv("INDOCS_TOKEN", "env-token");
    vi.stubEnv("INDOCS_URL", "https://env.example.com");
    expect(await requireConfig()).toEqual({ baseUrl: "https://env.example.com", token: "env-token" });
  });

  it("config.json の接続先は INDOCS_URL で上書きできる", async () => {
    await writeFile(path.join(dir, "config.json"), JSON.stringify(saved));
    vi.stubEnv("INDOCS_URL", "http://localhost:5173/");
    expect(await requireConfig()).toEqual({ ...saved, baseUrl: "http://localhost:5173" });
  });

  it("config.json も INDOCS_TOKEN もなければペアリングを促す", async () => {
    await expect(requireConfig()).rejects.toThrow("indocs pair");
  });
});
