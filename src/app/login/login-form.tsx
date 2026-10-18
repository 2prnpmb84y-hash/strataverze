"use client";

import { useState } from "react";
import { login, signup } from "./actions";
import {
  PasswordStrength,
  validatePasswordStrength,
} from "@/components/ui/password-strength";

type Tab = "owner" | "adviser";

const tabConfig = {
  owner: {
    label: "Owner / Supplier",
    description: "Sign in to manage your strata property",
    accent: "var(--color-owner)",
    ring: "focus:ring-primary-400",
    buttonBg: "bg-primary-400 hover:bg-primary-500 focus:ring-primary-400",
  },
  adviser: {
    label: "Adviser",
    description: "Sign in to manage schemes as a strata professional",
    accent: "var(--color-adviser)",
    ring: "focus:ring-gold-400",
    buttonBg: "bg-gold-400 hover:bg-gold-500 focus:ring-gold-400",
  },
} as const;

export function LoginForm({
  error,
  message,
}: {
  error?: string;
  message?: string;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("owner");
  const [isSignUp, setIsSignUp] = useState(false);
  const [password, setPassword] = useState("");
  const config = tabConfig[activeTab];

  return (
    <>
      {/* Tab toggle */}
      <div className="flex rounded-lg bg-muted p-1 mb-6">
        {(["owner", "adviser"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${
              activeTab === tab
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            style={
              activeTab === tab
                ? { borderBottom: `2px solid ${tabConfig[tab].accent}` }
                : undefined
            }
          >
            {tabConfig[tab].label}
          </button>
        ))}
      </div>

      <h1 className="text-xl font-bold font-heading text-card-foreground mb-1">
        {isSignUp ? "Create account" : "Sign in"}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">{config.description}</p>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {message && (
        <div className="rounded-lg bg-primary-50 border border-primary-200 px-4 py-3 mb-4">
          <p className="text-sm text-primary-500">{message}</p>
        </div>
      )}

      <form className="flex flex-col gap-4">
        {/* Hidden field to pass the selected portal mode to the server action */}
        <input type="hidden" name="portal" value={activeTab} />

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-card-foreground mb-1.5"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent transition-shadow"
            style={
              { "--tw-ring-color": config.accent } as React.CSSProperties
            }
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-card-foreground mb-1.5"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete={isSignUp ? "new-password" : "current-password"}
            minLength={isSignUp ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent transition-shadow"
            style={
              { "--tw-ring-color": config.accent } as React.CSSProperties
            }
            placeholder="••••••••"
          />
          {isSignUp && <PasswordStrength password={password} />}
        </div>

        <div className="flex justify-end">
          <a
            href="/forgot-password"
            className="text-sm transition-colors"
            style={{ color: config.accent }}
          >
            Forgot password?
          </a>
        </div>

        <div className="flex flex-col gap-2 mt-2">
          {isSignUp ? (
            <>
              <button
                formAction={(formData) => {
                  const { allMet } = validatePasswordStrength(password);
                  if (!allMet) return;
                  signup(formData);
                }}
                className="w-full h-11 rounded-lg text-white font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: config.accent,
                  "--tw-ring-color": config.accent,
                } as React.CSSProperties}
                disabled={!validatePasswordStrength(password).allMet}
              >
                Create account
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(false);
                  setPassword("");
                }}
                className="w-full h-11 rounded-lg border border-border bg-background text-card-foreground font-medium text-sm transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2"
                style={
                  { "--tw-ring-color": config.accent } as React.CSSProperties
                }
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <button
                formAction={login}
                className="w-full h-11 rounded-lg text-white font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2"
                style={{
                  backgroundColor: config.accent,
                  "--tw-ring-color": config.accent,
                } as React.CSSProperties}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(true);
                  setPassword("");
                }}
                className="w-full h-11 rounded-lg border border-border bg-background text-card-foreground font-medium text-sm transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2"
                style={
                  { "--tw-ring-color": config.accent } as React.CSSProperties
                }
              >
                Create account
              </button>
            </>
          )}
        </div>
      </form>
    </>
  );
}
