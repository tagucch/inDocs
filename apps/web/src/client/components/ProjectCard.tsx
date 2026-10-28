import { useState } from "preact/hooks";
import { formatTime, type ProjectGroup } from "../../shared/grouping";
import type { PageSummary } from "../../shared/types";
import { Link } from "../router";
import { Icon } from "./Icons";

const COLLAPSE_AT = 4;

type Props = {
  group: ProjectGroup;
  now: Date;
  onToggleStar: (project: string, starred: boolean) => void;
  onTogglePin: (project: string, pinned: boolean) => void;
  onOpen: (page: PageSummary) => void;
};

export function ProjectCard({ group, now, onToggleStar, onTogglePin, onOpen }: Props) {
  const [expanded, setExpanded] = useState(false);
  const pages = expanded || group.pages.length <= COLLAPSE_AT ? group.pages : group.pages.slice(0, COLLAPSE_AT - 1);
  const rest = group.pages.length - pages.length;
  return (
    <section class="card" aria-label={group.project}>
      <div class="card-head">
        <span class="name" title={group.projectLabel ?? group.project}>
          {group.project}
        </span>
        <span class="count">{group.pages.length}件</span>
        <button
          class={`toggle pin ${group.pinned ? "on" : ""}`}
          aria-label={group.pinned ? "ピン留めを外す" : "ピン留めする"}
          aria-pressed={group.pinned}
          onClick={() => onTogglePin(group.project, !group.pinned)}
        >
          <Icon name="pin" filled={group.pinned} />
        </button>
        <button
          class={`toggle star ${group.starred ? "on" : ""}`}
          aria-label={group.starred ? "スターを外す" : "スターを付ける"}
          aria-pressed={group.starred}
          onClick={() => onToggleStar(group.project, !group.starred)}
        >
          <Icon name="star" filled={group.starred} />
        </button>
      </div>
      {pages.map((page) => (
        <Link
          key={page.slug}
          href={`/p/${page.slug}`}
          class={`row ${page.unread ? "unread" : "read"}`}
          onClick={() => onOpen(page)}
        >
          <span class="dot" aria-hidden="true" />
          <span class="title">{page.title}</span>
          {page.starred ? (
            <span class="star-mini">
              <Icon name="star" filled size={14} />
            </span>
          ) : null}
          <span class="time">{formatTime(page.updatedAt, now)}</span>
        </Link>
      ))}
      {rest > 0 ? (
        <button class="more" onClick={() => setExpanded(true)}>
          他 {rest} 件を表示
        </button>
      ) : null}
    </section>
  );
}
