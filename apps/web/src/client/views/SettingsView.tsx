import { useEffect, useState } from "preact/hooks";
import type { DeviceSummary, PairingResponse } from "../../shared/types";
import { api } from "../api";
import { Header } from "../components/Header";
import { Icon } from "../components/Icons";
import { describeError } from "../store";

export function SettingsView({ email }: { email: string }) {
  const [pairing, setPairing] = useState<PairingResponse | null>(null);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState("");

  const loadDevices = () => api.devices().then(setDevices).catch((err: unknown) => setError(describeError(err)));
  useEffect(() => {
    void loadDevices();
  }, []);

  useEffect(() => {
    if (!pairing) return;
    const tick = () => {
      const ms = new Date(pairing.expiresAt).getTime() - Date.now();
      if (ms <= 0) {
        setPairing(null);
        return;
      }
      setRemaining(`${Math.floor(ms / 60_000)}分${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}秒`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [pairing]);

  const command = pairing ? `indocs pair ${pairing.code} --url ${location.origin}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("クリップボードにコピーできませんでした。コマンドを手で選択してください");
    }
  };

  return (
    <>
      <Header title="設定" back />
      <main>
        {error ? <div class="error">{error}</div> : null}
        <section class="panel">
          <h2>アカウント</h2>
          <div class="list-item">
            <div class="grow">
              <div>{email}</div>
              <div class="meta">Google アカウントでログイン中</div>
            </div>
            <button
              class="btn secondary"
              onClick={async () => {
                await api.logout().catch(() => undefined);
                location.assign("/");
              }}
            >
              ログアウト
            </button>
          </div>
        </section>

        <section class="panel">
          <h2>この PC を登録</h2>
          <p class="task-ctx">
            Claude Code が動く PC から HTML を登録できるようにします。コードを発行して、その PC のターミナルで下のコマンドを実行してください（10 分で失効）。
          </p>
          {pairing ? (
            <>
              <div class="big-code">{pairing.code}</div>
              <div class="code-box">{command}</div>
              <div class="form-row">
                <span class="hint">残り {remaining}</span>
                <button class="btn primary" onClick={() => void copy()}>
                  <Icon name={copied ? "check" : "copy"} size={16} />
                  {copied ? "コピーしました" : "コマンドをコピー"}
                </button>
              </div>
            </>
          ) : (
            <button
              class="btn primary"
              onClick={() =>
                api
                  .createPairing()
                  .then(setPairing)
                  .catch((err: unknown) => setError(describeError(err)))
              }
            >
              コードを発行
            </button>
          )}
        </section>

        <section class="panel">
          <h2>
            登録済みの PC <span class="count">{devices.length}台</span>
          </h2>
          {devices.length === 0 ? <p class="task-ctx">まだありません。</p> : null}
          {devices.map((device) => (
            <div class="list-item" key={device.id}>
              <div class="grow">
                <div>{device.name}</div>
                <div class="meta">
                  登録 {new Date(device.createdAt).toLocaleDateString("ja-JP")}
                  {device.lastUsedAt ? ` ・ 最終利用 ${new Date(device.lastUsedAt).toLocaleString("ja-JP")}` : ""}
                </div>
              </div>
              <button
                class="btn danger"
                onClick={() => {
                  if (!confirm(`${device.name} の登録を解除しますか？この PC からは登録できなくなります。`)) return;
                  api
                    .revokeDevice(device.id)
                    .then(loadDevices)
                    .catch((err: unknown) => setError(describeError(err)));
                }}
              >
                解除
              </button>
            </div>
          ))}
        </section>

        <section class="panel">
          <h2>ホーム画面に追加</h2>
          <p class="task-ctx">
            iPhone / iPad は Safari の共有メニューから「ホーム画面に追加」、Android は Chrome のメニューから「アプリをインストール」、PC はアドレスバー右端のインストールアイコンを押すと、アプリのように開けます。
          </p>
        </section>
      </main>
    </>
  );
}
