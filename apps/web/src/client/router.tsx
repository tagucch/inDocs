import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

const listeners = new Set<() => void>();

export function navigate(path: string, options: { replace?: boolean } = {}): void {
  if (options.replace) history.replaceState({ app: true }, "", path);
  else history.pushState({ app: true }, "", path);
  for (const listener of listeners) listener();
}

export function usePath(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    listeners.add(update);
    window.addEventListener("popstate", update);
    return () => {
      listeners.delete(update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  return path;
}

export function Link(props: JSX.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const { href, onClick, ...rest } = props;
  return (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        if (typeof onClick === "function") onClick(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (rest.target && rest.target !== "_self") return;
        event.preventDefault();
        navigate(href);
      }}
    />
  );
}
