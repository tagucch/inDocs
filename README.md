# inDocs

AI エージェント（Claude Code や Codex）に作らせた HTML を 1 か所に集めて、PC とスマホのどちらからも読めるようにする自分専用サイトです。Cloudflare Workers / D1 / R2 だけで動き、指定した Google アカウントでしかログインできません。

minorun365 氏の「[HTML共有くん](https://github.com/minorun365/html-share)」の考え方（成果物を 1 か所にためる、既読を端末間で同期する、スマホから依頼を置く）を参考に、Cloudflare 向けに設計し直したものです。

## できること

- **ためる**: `indocs add report.html` でページを登録する。画像やフォントは 1 枚の HTML に埋め込むのでリンクが切れない
- **見つける**: 案件（プロジェクト）ごとにカードにまとまり、今日・昨日・今週の区切りで新しい順に並ぶ。未読・スター・ピン留め・検索で絞り込める
- **読む**: 既読・スター・非表示は PC とスマホで同期する。PWA としてホーム画面に置ける。はみ出す表はスマホ幅でカードに畳まれる
- **やり取りする**: スマホから依頼を置き、PC の Claude Code が `/inbox` で引き取る。PC からの確認カードにスマホで承認やコメントを返す
- **守る**: Google ログイン（許可メールのみ）。配信 HTML は `sandbox` 付きの CSP で隔離され、Cookie や API に触れない

## 構成

```text
ブラウザ (PC / スマホ, PWA)
   │ セッション Cookie
   ▼
Cloudflare Worker "indocs" (Hono)
   ├─ Static Assets  管理画面 (Preact + Vite)
   ├─ /auth/*        Google OIDC
   ├─ /api/owner/*   ブラウザ用 API
   ├─ /api/device/*  CLI 用 API（端末トークン）
   ├─ /view/:slug    配信 HTML（R2 → sandbox CSP）
   ├─ R2             HTML 本体
   └─ D1             台帳・既読・インボックス・端末
   ▲ 端末トークン
手元の PC: Claude Code + indocs CLI + スキル
```

詳しくは [docs/design.md](docs/design.md) を参照してください。全体像を 1 枚で掴むには [docs/catchup.html](docs/catchup.html)（キャッチアップ資料）があります。

## セットアップ

[docs/setup.md](docs/setup.md) に手順があります。要点は次のとおりです。

1. `pnpm install`
2. D1 と R2 を作って `pnpm deploy`
3. Google Cloud で OAuth クライアントを作り、`wrangler secret put` で `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `ALLOWED_EMAILS` / `SESSION_SECRET` を登録して再デプロイ
4. ブラウザでログイン → 設定 → 「この PC を登録」→ `indocs pair`
5. `skills/` を `~/.claude/skills/` にリンク

## 使い方

セットアップが済んだら、Claude Code にいつもどおり頼むだけです。

> この HTML を inDocs に共有して

> `/inbox` で、スマホから置いた依頼を引き取って

> `/mobile` で、続きはスマホから判断する

> `/github-digest` で、watch 中リポジトリの昨日の Issue / PR をまとめて流す

CLI を直接使うこともできます。最初の動作確認には同梱のサンプル（`indocs add examples/welcome.html --project inDocs`）が使えます。

```bash
indocs add report.html --project "新機能リリース"
indocs list
indocs remove <slug>
indocs inbox
indocs review push --session <id> --file cards.json
```

## リポジトリ

```text
apps/web/        Worker + 管理画面（Hono, Preact, Vite, wrangler）
packages/cli/    indocs CLI（Node 22+, 依存なし）
skills/          Claude Code 用スキル（indocs-share, inbox, mobile, github-digest）
docs/            設計メモとセットアップ手順
```

```bash
pnpm dev      # ローカル開発 (http://localhost:5173)
pnpm check    # 型検査
pnpm test     # テスト
pnpm build    # Worker と CLI のビルド
pnpm deploy   # Cloudflare へデプロイ
```

## ライセンス

MIT
