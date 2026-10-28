---
name: mobile
description: Hand the current task over to the user's phone through inDocs - publish a status page, push a review card, wait for approval or follow-up comments, then continue the same task. Use only when the user explicitly invokes /mobile, asks to continue or approve from a phone, or asks to stop waiting for the phone.
---

# スマホへの引き継ぎ

`indocs` CLI を使う。API を直接呼ばない。端末トークンを表示しない。

## セッション ID を決める

最初に見つかった値を使う。

1. `claude-${CLAUDE_SESSION_ID}`
2. `codex-${CODEX_THREAD_ID}`
3. この会話で既に使った安定した ID

どれもなければ、再開できるセッション ID が取れないことを説明し、カードを作らずに止める。

## 引き継ぎの流れ

1. 先に回答済みのカードを取り込む。

   ```bash
   indocs review pull --session "<session-id>"
   ```

   返ってきたコメントは新しいユーザー指示として扱う。対応し終えたカードだけ完了にする。

   ```bash
   indocs complete <card-id>
   ```

2. 状況ページを 1 枚の HTML にまとめる（スマホで読める簡潔さで）。
   - 今の依頼と状況
   - 終えた作業
   - ユーザーに決めてほしいこと
   - 次の一手

   秘密情報、生ログ、関係のないリポジトリ情報は載せない。`indocs-share` スキルの要領で登録する。

   ```bash
   indocs add <status.html> --project "<案件名>"
   ```

3. 確認カードを送る。基本は 1 枚。本当に独立した判断だけ別カードにし、最大 5 枚。

   ```bash
   printf '%s' '[{"title":"<短い題名>","question":"<聞きたいこと>","context":"<判断材料の要点>","recommendation":"<あなたの推奨>"}]' \
     | indocs review push --session "<session-id>"
   ```

4. 回答を待つ（20 秒ごとに確認、既定 240 分で時間切れ）。

   ```bash
   indocs review watch --session "<session-id>" --timeout-minutes 240
   ```

   時間切れ（終了コード 2）になったら、その旨を伝えて止まる。ユーザーが「止めて」と言ったら watch を終了する。

5. 返ってきた承認やコメントをユーザー指示として適用する。対応したカードを `indocs complete` で完了にし、状況ページを更新して登録し直し、次の判断が必要ならまたカードを送る。

未回答のカードが作業を止めている間、または watch の最中に、作業を「完了」と宣言しない。
