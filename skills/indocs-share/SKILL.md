---
name: indocs-share
description: Publish an HTML file to the user's inDocs site (a private, Google-login-only dashboard on Cloudflare) so they can read it on PC and phone. Use when the user asks to share, publish, register or sync an HTML page to inDocs, 共有くん or "the dashboard", e.g. 「inDocs に共有して」「このHTMLを追加して」「スマホで見られるようにして」, or right after you produced an HTML report the user will want to read later.
---

# inDocs に HTML を共有する

`indocs` CLI を使う。API を直接呼ばない。端末トークンを表示しない。

## 手順

1. 共有する HTML ファイルを決める。完成した単一ファイルの HTML にする（画像やフォントは同じフォルダ配下に置けば CLI が埋め込む。`<title>` を具体的に付ける）。
2. 登録する。

   ```bash
   indocs add <path/to/file.html> --project "<案件名>"
   ```

   - `--project` は一覧でカードにまとめる単位。会話で分かる案件名・テーマ名を短く付ける。省略すると Git リポジトリ名（なければ親フォルダ名）になる
   - `--title` は省略すると `<title>` → `<h1>` → ファイル名の順で決まる
   - 同じファイル名（slug）で `add` し直すと同じページが更新され、一覧で未読に戻る。別ページにしたいときはファイル名を変える
   - `--slug` で URL の識別子を固定できる（英小文字・数字・ハイフン）
3. 出力された URL を 1 行でユーザーに伝える。埋め込めなかった参照が警告されたら、その旨も伝える。

## うまくいかないとき

- 「この PC はまだ登録されていません」と出たら、ユーザーに inDocs の「設定 → この PC を登録」でコードを発行してもらい、表示されたコマンド（`indocs pair <code> --url <URL>`）を実行する
- 401 が返るときは端末トークンが失効している。同じくペアリングをやり直す
- `indocs list` で登録済みページを確認でき、`indocs remove <slug>` で一覧から消せる（確認してから実行する）
