"use client";

import { useEffect, useRef } from "react";

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Turnstile did not load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * The Cloudflare Turnstile check (SEC-020). Place it inside the form: it
 * adds a hidden `cf-turnstile-response` field with the token, which the
 * server action passes to Supabase. Renders nothing without a site key.
 * The script is added from here, so the nonce-based CSP admits it
 * ('strict-dynamic'); its frame is allowed in src/proxy.ts.
 */
export function Turnstile({ siteKey }: { siteKey: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!siteKey || !box.current) return;
    let widgetId: string | null = null;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        widgetId = window.turnstile.render(box.current, { sitekey: siteKey, theme: "light", size: "flexible" });
      })
      .catch(() => {
        // Sign-in still works while CAPTCHA is off in Supabase; when it is on, Supabase refuses and the page says so.
      });
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);
  if (!siteKey) return null;
  return <div ref={box} className="min-h-[65px]" aria-label="Security check" />;
}
