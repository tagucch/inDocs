import type { ComponentChildren } from "preact";
import { Link, navigate } from "../router";
import { Icon } from "./Icons";

export function goBack(fallback = "/"): void {
  if (history.state?.app) history.back();
  else navigate(fallback, { replace: true });
}

export function Header(props: { title?: string; back?: boolean; children?: ComponentChildren; below?: ComponentChildren }) {
  return (
    <header class="app-header">
      <div class="header-row">
        {props.back ? (
          <button class="icon-btn" aria-label="戻る" onClick={() => goBack()}>
            <Icon name="back" />
          </button>
        ) : null}
        {props.title ? (
          <span class="brand">{props.title}</span>
        ) : (
          <Link href="/" class="brand">
            <Icon name="logo" />
            inDocs
          </Link>
        )}
        {props.children}
      </div>
      {props.below}
    </header>
  );
}
