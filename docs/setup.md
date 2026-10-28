# セットアップ

inDocs は自分の Cloudflare アカウントにデプロイして使います。必要なものは次の 4 つです。

- Node.js 22 以上と pnpm
- Cloudflare アカウント（Workers / D1 / R2 の無料枠で動きます）
- Google Cloud の OAuth クライアント（ログインに使います）
- Claude Code または Codex が動く PC

## 1. 依存関係を入れる

```bash
git clone <このリポジトリ>
cd inDocs
pnpm install
```

## 2. Cloudflare にログインする

```bash
pnpm --filter @indocs/web exec wrangler login
```

## 3. D1 と R2 を作る

```bash
pnpm --filter @indocs/web exec wrangler d1 create indocs
pnpm --filter @indocs/web exec wrangler r2 bucket create indocs-pages
```

`d1 create` の出力に出る `database_id` を [apps/web/wrangler.jsonc](../apps/web/wrangler.jsonc) の `d1_databases[0].database_id` として追記します。続けてスキーマを適用します。

```bash
pnpm --filter @indocs/web db:migrate:remote
```

## 4. 最初のデプロイで URL を確定する

```bash
pnpm deploy
```

出力される `https://indocs.<アカウント名>.workers.dev` が公開 URL です。この時点ではまだログインできません。

## 5. Google の OAuth クライアントを作る

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを選び、「API とサービス → OAuth 同意画面」を設定します。ユーザーの種類は「外部」でよく、テストユーザーに自分の Google アカウントを追加します（公開ステータスを「テスト」のままにしておけば、追加したアカウント以外は Google の時点で弾かれます）
2. 「認証情報 → 認証情報を作成 → OAuth クライアント ID」で、種類を「ウェブ アプリケーション」にします
3. 「承認済みのリダイレクト URI」に次を追加します
   - `https://indocs.<アカウント名>.workers.dev/auth/callback`
   - 開発用に `http://localhost:5173/auth/callback`
4. クライアント ID とクライアント シークレットを控えます

## 6. シークレットを登録する

```bash
cd apps/web
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
pnpm exec wrangler secret put ALLOWED_EMAILS      # 例: you@gmail.com,partner@gmail.com
pnpm exec wrangler secret put SESSION_SECRET      # openssl rand -base64 48 の出力など
cd ../..
pnpm deploy
```

`ALLOWED_EMAILS` に入っていない Google アカウントは、ログインしても 403 になります。後から増減するときは同じコマンドで上書きして、再デプロイは不要です（次のリクエストから反映されます）。

## 7. ブラウザでログインして PC を登録する

1. 公開 URL を開き「Google でログイン」を押します
2. 右上の設定（スライダーのアイコン）→「この PC を登録」→「コードを発行」
3. 表示されたコマンドを Claude Code が動く PC で実行します

```bash
pnpm --filter @indocs/cli build
mkdir -p ~/.local/bin && ln -sf "$(pwd)/packages/cli/dist/indocs.mjs" ~/.local/bin/indocs   # PATH の通った場所に置く
indocs pair XXXX-XXXX --url https://indocs.<アカウント名>.workers.dev
indocs whoami
```

`~/.local/bin` が PATH に入っていなければ、`/usr/local/bin/indocs` などに置き換えてください。CLI は依存関係のない単一ファイルなので、リンク先を差し替えるだけで更新できます。

端末トークンは `~/.config/indocs/config.json` に 0600 で保存されます。

## 8. Claude Code にスキルを入れる

```bash
mkdir -p ~/.claude/skills
ln -s "$(pwd)/skills/indocs-share" ~/.claude/skills/indocs-share
ln -s "$(pwd)/skills/inbox" ~/.claude/skills/inbox
ln -s "$(pwd)/skills/mobile" ~/.claude/skills/mobile
```

Claude Code に「この HTML を inDocs に共有して」と頼み、一覧にページが出れば完了です。

## 9. ホーム画面に追加する

- iPhone / iPad: Safari で開き、共有 →「ホーム画面に追加」
- Android: Chrome のメニュー →「アプリをインストール」
- PC: アドレスバー右端のインストールアイコン

## ローカル開発

```bash
cp apps/web/.dev.vars.example apps/web/.dev.vars   # 値を埋める
pnpm --filter @indocs/web db:migrate:local
pnpm dev                                           # http://localhost:5173
```

`.dev.vars` に `DEV_LOGIN_EMAIL` を書くと、`http://localhost:5173/auth/dev-login` で Google を経由せずにそのメールとしてログインできます。この入口は `localhost` からのアクセスで、かつその変数があるときだけ有効です。本番の secret には絶対に置かないでください。

CLI をローカルの Worker に向けるには `INDOCS_URL=http://localhost:5173` を付けるか、`indocs pair <code> --url http://localhost:5173` でペアリングします。設定の置き場所を分けたいときは `INDOCS_CONFIG_DIR` を使います。
