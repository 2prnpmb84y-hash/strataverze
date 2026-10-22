"use client";

import { useEffect, useRef } from "react";

const DEFAULT_MESSAGE =
  "You have unsaved changes. Leave this page and discard them?";

/**
 * Warns before leaving a page with unsaved form edits. Place it inside a
 * <form>. It marks the form dirty on the first input and clears on submit, then
 * guards two exits:
 *  - a full-page reload or tab close (beforeunload), and
 *  - an in-app navigation via a link elsewhere on the page (click capture),
 *    which covers Next.js <Link> clicks and the portal navigation.
 * Links inside the form, new-tab/modified clicks, downloads, hash, mailto and
 * tel links, and cross-origin links are left alone.
 */
export function UnsavedGuard({ message = DEFAULT_MESSAGE }: { message?: string }) {
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;

    let dirty = false;
    const onInput = () => {
      dirty = true;
    };
    const onSubmit = () => {
      dirty = false;
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!dirty || e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || form.contains(a) || a.hasAttribute("download")) return;
      if (a.target && a.target !== "_self") return;
      const href = a.getAttribute("href") ?? "";
      if (
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      )
        return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    form.addEventListener("input", onInput);
    form.addEventListener("submit", onSubmit);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      form.removeEventListener("input", onInput);
      form.removeEventListener("submit", onSubmit);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [message]);

  return <span ref={anchor} hidden aria-hidden="true" />;
}
