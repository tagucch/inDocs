# inDocs 設計メモ

## 目的

Claude Code や Codex などの AI エージェントに作らせた HTML を 1 か所に集め、PC とスマホのどちらからも同じように読めるようにする。
発想は minorun365 氏の「HTML共有くん」を参考にしつつ、AWS ではなく Cloudflare だけで完結する構成に組み替える。

## 要件

- Cloudflare のサービスだけで動く（Workers / Static Assets / R2 / D1）
- PWA として PC・スマホのホーム画面に置け、アプリのように開ける
- 指定した Google アカウントだけがログインできる
- Claude Code から「共有して」と頼むだけで登録できる（CLI とスキル）
- スマホから依頼を置き、PC の Claude Code が引き取る「インボックス」を持つ
- PC 側の確認依頼にスマホから承認・コメントを返せる
- 配信 HTML のはみ出す表はスマホ幅でカードに畳む

## 全体構成

```text
ブラウザ (PC / スマホ, PWA)
   │ Cookie セッション
   ▼
Cloudflare Worker: indocs (Hono)
   ├─ Static Assets ── 管理画面 SPA (Preact + Vite)      /, /inbox, /p/:slug
   ├─ /auth/*        ── Google OIDC ログイン・ログアウト
   ├─ /api/owner/*   ── ブラウザ用 API（セッション Cookie）
   ├─ /api/device/*  ── CLI 用 API（端末トークン）
   ├─ /view/:slug    ── 配信 HTML（R2 から取り出し、sandbox CSP を付与）
   ├─ R2: indocs-pages ── HTML 本体
   └─ D1: indocs       ── ページ台帳・本人設定・インボックス・端末
   ▲
   │ 端末トークン
手元の PC: Claude Code + indocs CLI
```

Worker は 1 つにまとめる。元の構成では閲覧面と管理面を別ドメインに分けていたが、workers.dev だけで始めるため、配信 HTML には `Content-Security-Policy: sandbox ...` を付けて opaque origin として実行させる。これで配信 HTML 内のスクリプトは Cookie・localStorage・同一オリジンの API に触れない。`connect-src 'none'` と `form-action 'none'` で外部送信も封じる。将来カスタムドメインを 2 つ用意できたら、`/view/*` だけを別 Worker に切り出せる形にしておく。

配信面の CSP は次の方針で決めた。

- `sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation`: スクリプトは動かすが同一オリジンの権限は与えない。リンクはクリック（ユーザー操作）があるときだけ開ける。勝手なリダイレクトはできない
- `script-src` / `style-src` / `img-src` / `font-src` に `https:` を許す: Claude が作る HTML は Google Fonts や Chart.js などの CDN を使うことが多い。sandbox で隔離済みなので、外部読み込みを許しても管理面の情報には届かない。HTML 自身の内容が外部へ漏れる経路（画像 URL など）は残るが、その内容は HTML を作った側が元から持っている情報なので許容した
- `connect-src 'none'`: fetch / XHR / WebSocket は一切させない
- `frame-ancestors 'self'`: 管理画面の iframe からだけ埋め込める

管理画面は PC でもスマホでも iframe で配信 HTML を表示する。スマホでトップレベル遷移にすると、ホーム画面から開いた PWA（standalone）では戻る手段がなくなるため。

iframe 側には `sandbox` 属性を付けない。隔離は配信レスポンスの CSP `sandbox` ディレクティブだけで行う。属性を重ねると二重防御にはなるが、組み込みブラウザの一部が `sandbox` 属性付き iframe の読み込みを遮断するため、表示できない環境が出る。配信 HTML はこの Worker 経由でしか届かず、CSP は必ず付くので、属性なしでも隔離は保たれる。

## 認証

### 本人ログイン（ブラウザ）

1. `GET /auth/login` で PKCE の verifier と state・nonce を短命 Cookie に入れ、Google の authorize エンドポイントへ送る
2. `GET /auth/callback` でコードをトークンに交換し、`id_token` を Google の JWKS で検証する（`iss` / `aud` / `exp` / `nonce`）
3. `email_verified` が真で、`ALLOWED_EMAILS` に含まれるメールだけを通す。それ以外は 403
4. HMAC 署名付きのセッション Cookie（`indocs_session`、30 日、HttpOnly / Secure / SameSite=Lax）を発行する

セッションはステートレスで、D1 には `users` に最終ログイン時刻だけを残す。失効させたいときは `SESSION_SECRET` を回す。

### CLI の認可（端末トークン）

ブラウザで「この PC を登録」を押すと 10 分で失効する一度限りのペアリングコードが出る。CLI は `indocs pair <code>` でコードを端末トークンに交換し、`~/.config/indocs/config.json`（0600）に保存する。D1 にはトークンの SHA-256 だけを置く。以後 CLI は `Authorization: Bearer <token>` で `/api/device/*` を呼ぶ。

## データモデル（D1）

| テーブル | 役割 |
|---|---|
| `users` | 許可メールで初回ログインした時刻。これより前に登録されたページは未読にしない |
| `pages` | ページ台帳。`slug` が一意。`project` でカードにまとめる。`updated_at` が既読判定の版になる |
| `page_states` | ユーザー × ページの既読版・スター・非表示 |
| `project_states` | ユーザー × プロジェクトのスター・ピン |
| `devices` | ペアリング済み端末。トークンのハッシュと名前 |
| `pairings` | ペアリングコードのハッシュと有効期限 |
| `tasks` | インボックスの依頼（スマホ→PC）と確認カード（PC→スマホ） |

既読の判定は「`pages.updated_at` が `page_states.read_version` より新しいか」で行う。端末間の同期はサーバーの値を正とし、クライアントは楽観的に更新してから PUT する。

## ページの登録と配信

- CLI の `indocs add <file.html>` が、同じディレクトリ配下の画像・フォントを `data:` URL に埋め込んで単一 HTML にし、`PUT /api/device/pages/:slug` で送る
- Worker は R2 に `pages/<slug>.html` として置き、D1 の `pages` を upsert する。中身のハッシュが同じなら `updated_at` を進めない
- `GET /view/:slug` はセッション Cookie を確認して R2 から返す。`</body>` の直前にスマホ向けの表カード化スクリプトをインラインで差し込む
- 管理画面は PC でもスマホでも iframe に表示する（ヘッダーに戻る・スター・新しいタブで開く・未読に戻す・隠すを置く）

## インボックス

依頼（スマホ → PC）と確認（PC → スマホ）は同じ `tasks` テーブルで扱い、`kind` で分ける。

- 依頼: スマホで本文と任意のプロジェクト名を入れて置く。CLI の `indocs inbox` が `waiting` のものを返し、引き取った時点で `indocs complete` にする。「取り込み済み」の状態は持たず、開いたままの依頼は「まだどの PC も拾っていない」ことを意味する
- 確認: CLI の `indocs review push` でカードを作り、`indocs review watch` が 20 秒間隔で回答を待つ。スマホは承認かコメントを返す。回答済みのカードは `pull` で取り込み、処理後に `complete` にする

## PWA

- `manifest.webmanifest` は `display: standalone`、`start_url: /`、192 / 512 / maskable のアイコン
- Service Worker はアプリシェル（HTML / JS / CSS / アイコン）だけをキャッシュし、`/api/*` `/auth/*` `/view/*` はネットワークのみにする
- iOS 向けに `apple-touch-icon` と `apple-mobile-web-app-capable` を置く

## 採用しなかった案

- **Cloudflare Access**: Zero Trust 側の設定に依存し、コードだけで環境を再現できなくなるため見送った
- **R2 への直接アップロード（S3 互換 API）**: 台帳の更新を CLI 側に持つことになり、Worker 経由の方が 1 か所で整合性を保てる
- **ローカルの YAML 台帳を正とする publish 方式**: 複数 PC から登録すると衝突するため、サーバー側の台帳を正にした
- **フロントエンドのフレームワークなし**: 一覧・既読・インボックスと状態が多いため、軽量な Preact を使う

## リポジトリ構成

```text
apps/web/        Worker + 管理画面 SPA（Hono, Preact, Vite, wrangler）
packages/cli/    indocs CLI（Node 22+, 依存なし, esbuild で単一ファイル）
skills/          Claude Code 用スキル（share, inbox, mobile）
docs/            設計・セットアップ
```
