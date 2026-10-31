"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import {
  searchProfilesAction,
  assignOwnerAction,
  removeOwnerAction,
} from "../actions";

type Owner = {
  id: string;
  profile: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
};

type SearchResult = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

/**
 * The lot's owners, with Remove, and the search to assign an owner directly.
 * Assigning is for the building's Adviser and StrataVerze only (S-01, 31 Oct
 * 2026): `canAssign` false hides the search. assignOwnerAction enforces the
 * same rule on the server.
 */
export function OwnerAssignment({
  schemeId,
  lotId,
  owners,
  canAssign,
}: {
  schemeId: string;
  lotId: string;
  owners: Owner[];
  canAssign: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSearch(value: string) {
    setQuery(value);
    setError(null);
    setSuccess(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 3) {
      setResults([]);
      setShowResults(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchProfilesAction(value, schemeId);
        setResults(found);
        setShowResults(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  function handleAssign(profileId: string, profileName: string) {
    setError(null);
    startTransition(async () => {
      const result = await assignOwnerAction(schemeId, lotId, profileId);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(`${profileName} assigned as owner.`);
        setQuery("");
        setResults([]);
        setShowResults(false);
      }
    });
  }

  function handleRemove(membershipId: string, ownerName: string) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await removeOwnerAction(schemeId, lotId, membershipId);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(`${ownerName} removed.`);
      }
    });
  }

  return (
    <div>
      {/* Current owners */}
      {owners.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {owners.map((m) => {
            const name =
              `${m.profile.firstName} ${m.profile.lastName}`.trim() ||
              m.profile.email;
            return (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{name}</p>
                  <p className="text-xs text-ink-muted">
                    {m.profile.email}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center rounded-full bg-mint-soft px-2.5 py-0.5 text-xs font-medium text-turquoise">
                    Owner
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemove(m.id, name)}
                    disabled={isPending}
                    className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {owners.length === 0 && (
        <p className="text-sm text-ink-muted mb-4">
          No owners assigned to this lot.
        </p>
      )}

      {/* Search and assign: the Adviser and StrataVerze only */}
      {canAssign && (
        <div ref={wrapperRef} className="relative">
          <label
            htmlFor="owner-search"
            className="block text-sm font-medium text-ink mb-1.5"
          >
            Assign Owner
          </label>
          <input
            id="owner-search"
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
            placeholder="Search by email or name..."
            className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors"
          />

          {searching && (
            <p className="mt-1.5 text-xs text-ink-muted">Searching...</p>
          )}

          {/* Search results dropdown */}
          {showResults && results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-[var(--radius-card)] border border-line bg-white shadow-lg max-h-48 overflow-y-auto">
              {results.map((p) => {
                const name =
                  `${p.firstName} ${p.lastName}`.trim() || p.email;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleAssign(p.id, name)}
                    disabled={isPending}
                    className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-line last:border-0 disabled:opacity-50"
                  >
                    <p className="text-sm font-medium text-ink">{name}</p>
                    <p className="text-xs text-ink-muted">{p.email}</p>
                  </button>
                );
              })}
            </div>
          )}

          {showResults && !searching && results.length === 0 && query.trim().length >= 2 && (
            <div className="absolute z-10 mt-1 w-full rounded-[var(--radius-card)] border border-line bg-white shadow-lg px-4 py-3">
              <p className="text-sm text-ink-muted">
                No matching profiles found. The owner must sign up first.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Feedback messages */}
      {error && (
        <p className="mt-3 text-sm text-red-500">{error}</p>
      )}
      {success && (
        <p className="mt-3 text-sm text-green-600">{success}</p>
      )}
    </div>
  );
}
