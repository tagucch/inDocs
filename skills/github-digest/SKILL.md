---
name: github-digest
description: Build the user's "GitHub 朝刊" - collect the issues and pull requests opened since the previous run (or on a given date range) in the GitHub repositories they watch, summarize each one in Japanese, render a single-page HTML digest and publish it to inDocs. Use when the user asks for the GitHub morning digest, 「GitHub 朝刊」「新着 Issue / PR をまとめて」「watch してるリポジトリの新着」, or when a scheduled task invokes it.
---

# GitHub 朝刊

watch 中のリポジトリに前回の実行以降できた Issue / PR を 1 枚の HTML にまとめ、inDocs に登録する。取得は `gh`（`GH_TOKEN` か `GITHUB_TOKEN` があるときは `fetch.mjs` が GitHub API を直接呼ぶ）、登録は `indocs` CLI を使う。スクリプトを通さずに API を叩かない。トークンを表示しない。

スクリプトは `~/.claude/skills/github-digest/scripts/` にある。作業ファイルはセッションのスクラッチディレクトリ（なければ `mktemp -d`）に置く。以下 `$WORK` と書く。前回の実行時刻は `~/.local/state/github-digest/state.json`（`GITHUB_DIGEST_STATE` で変更可）に記録される。スクリプトはローカル時刻で動くので、JST でない環境では `TZ=Asia/Tokyo` を付ける。

## 手順

1. 新着を取得する。

   ```bash
   node ~/.claude/skills/github-digest/scripts/fetch.mjs --out "$WORK/digest.json"
   ```

   - 引数なしだと「前回の実行時刻 〜 今」が対象になる。記録がなければ直近 24 時間
   - `--date YYYY-MM-DD` でその日の 0:00〜24:00、`--days N` で対象日を終端にした N 日間、`--since <ISO 時刻> [--until <ISO 時刻>]` で任意の範囲、`--repo owner/name` の繰り返しで対象を絞れる
   - stderr に件数と対象期間が出る。`errors` に入ったリポジトリは HTML に「取得できなかった」と載るので、再実行はせず先へ進んでよい
   - `gh` の認証エラーなら `gh auth status` を確認してユーザーに伝える

2. 要約を書く。`$WORK/digest.json` の `items` を読み、`$WORK/summaries.json` を作る。

   ```json
   {
     "lead": "全体の見出し 1〜2 文",
     "items": { "owner/repo#12": "この Issue / PR の要約" }
   }
   ```

   - `items` のキーは `repo` と `number` を `#` でつないだもの。全件に書く
   - 要約は日本語 1〜2 文（80〜140 字目安）。「何を・なぜ」が伝わるようにし、タイトルの言い換えで終わらせない。`body` が空なら title・labels・差分量から分かる範囲で書き、推測で補わない
   - Dependabot / Renovate など機械的な PR は「x を a → b に更新」程度でよい
   - `lead` は件数の羅列ではなく、注目すべき動きを書く
   - 新着がゼロ（`counts.issues` と `counts.prs` がともに 0）なら、要約も HTML も登録も作らず、手順 5 に進む。動きのなかった日のページは要らない

3. HTML にする。

   ```bash
   node ~/.claude/skills/github-digest/scripts/render.mjs --data "$WORK/digest.json" --summaries "$WORK/summaries.json" --out "$WORK/github-digest-<slug>.html"
   ```

   `<slug>` は `digest.json` の `window.slug`（引数なしの実行では `YYYY-MM-DD-HHMM`、`--date` では `YYYY-MM-DD`）。ファイル名がそのまま inDocs の slug になるので、同じ範囲を作り直すと同じページが更新される。

4. inDocs に登録する。

   ```bash
   indocs add "$WORK/github-digest-<slug>.html" --project "GitHub 朝刊"
   ```

5. 登録が成功したら（新着ゼロで登録を飛ばしたときも）、今回の実行を記録する。

   ```bash
   node ~/.claude/skills/github-digest/scripts/mark-run.mjs --data "$WORK/digest.json" --slug github-digest-<slug>
   ```

   - 記録は対象期間の終端（`window.end`）で進む。登録に失敗したときは実行せず、次回がその分を拾うのに任せる
   - 新着ゼロで飛ばしたときは `--slug` を付けない
   - `--date` や `--since` で過去分を作り直したときは、終端が記録より前なら何も変わらない

6. 出力された URL と件数（Issue / PR / 動きのあったリポジトリ）、対象期間を 1〜2 行で伝える。新着ゼロのときは「新着なし」と対象期間だけを 1 行で伝える。

## うまくいかないとき

- 「この PC はまだ登録されていません」や 401 → 端末トークンの問題。indocs-share スキルの手順どおりペアリングし直す
- `gh` が見つからない → Homebrew の `gh` が PATH にない。`/opt/homebrew/bin/gh` を確認する
- 特定リポジトリだけ 404 / 403 → アクセス権がなくなっている。HTML の「取得できなかったリポジトリ」に載るのでそのまま配信し、ユーザーに一言添える
- 対象期間がおかしい → `~/.local/state/github-digest/state.json` の `lastRunAt` を確認する。消せば次回は直近 24 時間になる

## クラウドの routine で動かす

Claude Code のクラウド定期実行では環境が毎回まっさらで、`state.json` も `gh` の認証も残らない。そのための手順は [routine.md](routine.md) にある。起点は inDocs に登録済みの最新の朝刊から `scripts/last-digest.mjs` で復元し、GitHub は `GH_TOKEN`、inDocs は `INDOCS_TOKEN` と `INDOCS_URL` で認証する。
