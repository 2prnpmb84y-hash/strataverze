"use client";

import { useMemo } from "react";

interface PasswordStrengthProps {
  password: string;
  showRequirements?: boolean;
}

interface Requirement {
  label: string;
  met: boolean;
}

export function validatePasswordStrength(password: string): {
  requirements: Requirement[];
  score: number;
  label: string;
  allMet: boolean;
} {
  const requirements: Requirement[] = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "One uppercase letter", met: /[A-Z]/.test(password) },
    { label: "One lowercase letter", met: /[a-z]/.test(password) },
    { label: "One number", met: /\d/.test(password) },
    { label: "One special character", met: /[^A-Za-z0-9]/.test(password) },
  ];

  const score = requirements.filter((r) => r.met).length;
  const allMet = score === requirements.length;

  let label = "Too weak";
  if (score >= 5) label = "Strong";
  else if (score >= 4) label = "Good";
  else if (score >= 3) label = "Fair";
  else if (score >= 2) label = "Weak";

  return { requirements, score, label, allMet };
}

export function PasswordStrength({
  password,
  showRequirements = true,
}: PasswordStrengthProps) {
  const { requirements, score, label } = useMemo(
    () => validatePasswordStrength(password),
    [password],
  );

  if (!password) return null;

  const barColours = [
    "bg-red-500",
    "bg-red-500",
    "bg-orange-500",
    "bg-amber-500",
    "bg-green-400",
    "bg-green-500",
  ];

  const textColours = [
    "text-red-600",
    "text-red-600",
    "text-orange-600",
    "text-amber-600",
    "text-green-500",
    "text-green-600",
  ];

  return (
    <div className="mt-2 space-y-2">
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < score ? barColours[score] : "bg-line"
              }`}
            />
          ))}
        </div>
        <span className={`text-xs font-medium ${textColours[score]}`}>
          {label}
        </span>
      </div>

      {/* Requirements list */}
      {showRequirements && (
        <ul className="space-y-1" role="list" aria-label="Password requirements">
          {requirements.map((req) => (
            <li
              key={req.label}
              className={`flex items-center gap-1.5 text-xs transition-colors ${
                req.met ? "text-green-600" : "text-ink-muted"
              }`}
            >
              <span aria-hidden="true">{req.met ? "✓" : "•"}</span>
              <span>
                {req.label}
                {req.met && <span className="sr-only"> (met)</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
