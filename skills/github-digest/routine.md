# GitHub 朝刊をクラウドの routine で動かす

Claude Code のクラウド定期実行（routine）がこのファイルを読んで実行する手順。routine 側のプロンプトは「リポジトリの `skills/github-digest/routine.md` を読み、そのとおりに進める」だけなので、手順を変えるときはこのファイルを main に入れればよい。手元の Claude Code から動かすときは [SKILL.md](SKILL.md) を使う。

## 前提

- 作業ディレクトリは `tagucch/inDocs` の clone（main）。Node 22 以上がある
- 環境変数 `GH_TOKEN`（GitHub の token）と `INDOCS_TOKEN`（inDocs の端末トークン）が設定されている。値を echo・ログ・報告に出さない
- inDocs は https://indocs.tagucch.workers.dev
- 環境は毎回まっさらで、SKILL.md が使う `~/.local/state/github-digest/state.json` は残らない。起点は inDocs に登録済みの最新の朝刊の終端から `scripts/last-digest.mjs` で復元する。新着ゼロの日はページを作らないので、その分は次の朝刊の範囲に含まれる
- ユーザーに質問せず最後まで進める。認証エラーで進めないときは、何が必要かを最後の報告に書いて終える

## 手順

1. 準備する。

   ```bash
   export TZ=Asia/Tokyo INDOCS_URL=https://indocs.tagucch.workers.dev
   command -v pnpm >/dev/null || npm install -g pnpm@11
   pnpm install --filter @indocs/cli --frozen-lockfile
   pnpm --filter @indocs/cli build
   WORK=$(mktemp -d)
   INDOCS="node $PWD/packages/cli/dist/indocs.mjs"
   $INDOCS whoami
   ```

   `whoami` が 401 なら `INDOCS_TOKEN` が無効（端末が削除されたか、値が違う）。報告して終える。

2. 起点を決めて新着を取得する。

   ```bash
   $INDOCS list --json > "$WORK/pages.json"
   SINCE=$(node skills/github-digest/scripts/last-digest.mjs --pages "$WORK/pages.json")
   node skills/github-digest/scripts/fetch.mjs ${SINCE:+--since "$SINCE"} --out "$WORK/digest.json"
   ```

   - stderr に件数と対象期間が出る。`errors` に入ったリポジトリは HTML に「取得できなかった」と載るので、再試行せず先へ進む
   - `GH_TOKEN` があるので `fetch.mjs` は `gh` を使わず GitHub API を直接呼ぶ。全リポジトリが 401 / 403 なら token の問題。報告して終える

3. 要約を書く。`$WORK/digest.json` の `items` を読み、`$WORK/summaries.json` を作る。

   ```json
   { "lead": "全体の見出し 1〜2 文", "items": { "owner/repo#12": "この Issue / PR の要約" } }
   ```

   - `counts.issues` と `counts.prs` がともに 0 なら、要約も HTML も登録も作らず手順 6 に進む
   - `items` のキーは `repo` と `number` を `#` でつないだもの。全件に書く
   - 要約は日本語 1〜2 文（80〜140 字目安）。「何を・なぜ」が伝わるようにし、タイトルの言い換えで終わらせない。`body` が空なら title・labels・差分量から分かる範囲で書き、推測で補わない
   - Dependabot / Renovate など機械的な PR は「x を a → b に更新」程度でよい
   - `lead` は件数の羅列ではなく、注目すべき動きを書く

4. HTML にする。`<slug>` は `digest.json` の `window.slug`。

   ```bash
   node skills/github-digest/scripts/render.mjs --data "$WORK/digest.json" --summaries "$WORK/summaries.json" --out "$WORK/github-digest-<slug>.html"
   ```

5. inDocs に登録する。

   ```bash
   $INDOCS add "$WORK/github-digest-<slug>.html" --project "GitHub 朝刊"
   ```

   `mark-run.mjs` は実行しない。この環境の記録は次回に残らず、起点は手順 2 で inDocs から復元する。

6. 報告する。登録した URL と件数（Issue / PR / 動きのあったリポジトリ数）、対象期間を 1〜2 行。新着ゼロのときは「新着なし」と対象期間だけを 1 行。

## routine の設定

- スケジュール: 平日 10:00 JST。routine の cron は UTC なので `0 1 * * 1-5`
- 環境: Claude Code の Default 環境。環境変数に `GH_TOKEN` と `INDOCS_TOKEN` を secret として入れる。ネットワークは `api.github.com`、`registry.npmjs.org`、`indocs.tagucch.workers.dev` に出られること
- プロンプト:

  > 作業ディレクトリに tagucch/inDocs の clone がある。`skills/github-digest/routine.md` を読み、書いてある手順をそのまま最後まで実行する。環境変数 GH_TOKEN と INDOCS_TOKEN の値は決して表示しない。
