---
name: github-digest
description: Build the user's "GitHub 朝刊" - collect the issues and pull requests opened yesterday (or on a given date range) in the GitHub repositories they watch, summarize each one in Japanese, render a single-page HTML digest and publish it to inDocs. Use when the user asks for the GitHub morning digest, 「GitHub 朝刊」「昨日の新着 Issue / PR をまとめて」「watch してるリポジトリの新着」, or when a scheduled task invokes it.
---

# GitHub 朝刊

watch 中のリポジトリに前日できた Issue / PR を 1 枚の HTML にまとめ、inDocs に登録する。取得は `gh`、登録は `indocs` CLI を使う。API を直接叩かない。トークンを表示しない。

スクリプトは `~/.claude/skills/github-digest/scripts/` にある。作業ファイルはセッションのスクラッチディレクトリ（なければ `mktemp -d`）に置く。以下 `$WORK` と書く。

## 手順

1. 新着を取得する。

   ```bash
   node ~/.claude/skills/github-digest/scripts/fetch.mjs --out "$WORK/digest.json"
   ```

   - 既定は昨日（ローカル日付）の 0:00〜24:00。`--date YYYY-MM-DD` で対象日、`--days N` で複数日（対象日を終端にした N 日間）、`--repo owner/name` の繰り返しで対象を絞れる
   - stderr に件数が出る。`errors` に入ったリポジトリは HTML に「取得できなかった」と載るので、再実行はせず先へ進んでよい
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
   - `lead` は件数の羅列ではなく、注目すべき動きを書く。新着ゼロのときは省略する

3. HTML にする。

   ```bash
   node ~/.claude/skills/github-digest/scripts/render.mjs --data "$WORK/digest.json" --summaries "$WORK/summaries.json" --out "$WORK/github-digest-<対象日>.html"
   ```

   `<対象日>` は `digest.json` の `window.label`（`YYYY-MM-DD`）。ファイル名がそのまま inDocs の slug になるので、同じ日を作り直すと同じページが更新される。

4. inDocs に登録する。

   ```bash
   indocs add "$WORK/github-digest-<対象日>.html" --project "GitHub 朝刊"
   ```

   新着ゼロの日もページを作って登録する（毎朝動いていることが一覧で分かるようにするため）。

5. 出力された URL と、件数（Issue / PR / 動きのあったリポジトリ）を 1〜2 行で伝える。

## うまくいかないとき

- 「この PC はまだ登録されていません」や 401 → 端末トークンの問題。indocs-share スキルの手順どおりペアリングし直す
- `gh` が見つからない → Homebrew の `gh` が PATH にない。`/opt/homebrew/bin/gh` を確認する
- 特定リポジトリだけ 404 / 403 → アクセス権がなくなっている。HTML の「取得できなかったリポジトリ」に載るのでそのまま配信し、ユーザーに一言添える
