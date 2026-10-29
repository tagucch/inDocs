import { parseArgs } from "node:util";
import { ApiError } from "./api.ts";
import { pair } from "./commands/pair.ts";
import { add, list, remove, whoami } from "./commands/pages.ts";
import { complete, inbox, reviewPull, reviewPush, reviewWatch } from "./commands/tasks.ts";
import { configPath } from "./config.ts";
import { fail, info } from "./output.ts";

const HELP = `indocs - AI エージェントが作った HTML を inDocs に登録する CLI

使い方:
  indocs pair <code> --url <inDocs の URL> [--name <この PC の名前>]
  indocs add <file.html> [--title <題名>] [--project <プロジェクト名>] [--slug <slug>] [--label <補足>]
  indocs list [--json]
  indocs remove <slug>
  indocs whoami
  indocs inbox [--json]                 スマホから置かれた依頼を一覧する
  indocs complete <id...>               依頼を完了にする
  indocs review push --session <id> [--file cards.json]   確認カードをスマホへ送る（標準入力でも可）
  indocs review pull --session <id>     回答済みのカードを取り出す
  indocs review watch --session <id> [--timeout-minutes 240]   回答が来るまで待つ

設定ファイル: ${configPath()}
環境変数:     INDOCS_URL（接続先の上書き）, INDOCS_TOKEN（config.json の代わりに使う端末トークン。INDOCS_URL と一緒に指定）, INDOCS_CONFIG_DIR（設定の置き場所）
`;

async function main(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      title: { type: "string" },
      project: { type: "string" },
      slug: { type: "string" },
      label: { type: "string" },
      name: { type: "string" },
      url: { type: "string" },
      session: { type: "string" },
      file: { type: "string" },
      "timeout-minutes": { type: "string" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, ...rest] = positionals;
  if (values.help || !command) {
    info(HELP);
    return;
  }
  switch (command) {
    case "pair":
      return pair(rest[0], values);
    case "add":
      return add(rest[0], values);
    case "list":
      return list(values);
    case "remove":
    case "rm":
      return remove(rest[0], values);
    case "whoami":
      return whoami(values);
    case "inbox":
      return inbox(values);
    case "complete":
    case "done":
      return complete(rest, values);
    case "review": {
      const sub = rest[0];
      if (sub === "push") return reviewPush(values);
      if (sub === "pull") return reviewPull(values);
      if (sub === "watch") return reviewWatch(values);
      throw new Error("review のサブコマンドは push / pull / watch です");
    }
    default:
      throw new Error(`不明なコマンドです: ${command}\n\n${HELP}`);
  }
}

main(process.argv.slice(2)).catch((err: unknown) => {
  if (err instanceof ApiError) fail(err.message, err.status === 401 ? 3 : 1);
  fail(err instanceof Error ? err.message : String(err));
});
