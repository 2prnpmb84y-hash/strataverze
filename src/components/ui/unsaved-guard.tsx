"use client";

import { useEffect, useRef } from "react";

/**
 * Warns before a full-page reload or tab close when the enclosing form has
 * unsaved edits. Place it inside a <form>. It finds its parent form, marks the
 * form dirty on the first input, and clears on submit.
 */
export function UnsavedGuard() {
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

    form.addEventListener("input", onInput);
    form.addEventListener("submit", onSubmit);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      form.removeEventListener("input", onInput);
      form.removeEventListener("submit", onSubmit);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  return <span ref={anchor} hidden aria-hidden="true" />;
}
