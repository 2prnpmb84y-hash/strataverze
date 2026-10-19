"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Search,
  X,
  Building2,
  FileText,
  Briefcase,
  Users,
  Home,
} from "lucide-react";
import { globalSearch, type SearchResult } from "@/app/search/actions";

/* ------------------------------------------------------------------ */
/*  Type icon map                                                     */
/* ------------------------------------------------------------------ */

const typeIcons: Record<string, typeof Building2> = {
  scheme: Building2,
  lot: Home,
  document: FileText,
  "work-order": Briefcase,
  contact: Users,
  meeting: FileText,
};

const typeLabels: Record<string, string> = {
  scheme: "Scheme",
  lot: "Lot",
  document: "Document",
  "work-order": "Work Order",
  contact: "Contact",
  meeting: "Meeting",
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function SearchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return <SearchDialogInner onClose={onClose} />;
}

/**
 * Inner component that mounts fresh each time the dialog opens,
 * so all state resets automatically.
 */
function SearchDialogInner({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derive portal from pathname
  const portal = pathname.split("/")[1] ?? "owner";

  // Focus input on mount
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Debounced search
  const doSearch = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (q.trim().length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await globalSearch(q, portal);
          setResults(res);
          setSelectedIndex(0);
        } catch {
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    [portal],
  );

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setQuery(value);
    doSearch(value);
  }

  function navigateTo(href: string) {
    onClose();
    router.push(href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      navigateTo(results[selectedIndex].href);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="fixed inset-x-0 top-[15vh] z-50 mx-auto w-full max-w-lg px-4">
        <div className="rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 border-b border-line">
            <Search size={18} className="text-ink-muted shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Search schemes, documents, work orders…"
              className="flex-1 py-3.5 text-sm text-ink placeholder:text-ink-muted bg-transparent outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  inputRef.current?.focus();
                }}
                className="text-ink-muted hover:text-ink transition-colors"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-line bg-muted px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[50vh] overflow-y-auto">
            {loading && (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-ink-muted">Searching…</p>
              </div>
            )}

            {!loading && query.trim().length >= 2 && results.length === 0 && (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-ink-muted">
                  No results found for &ldquo;{query}&rdquo;
                </p>
              </div>
            )}

            {!loading && results.length > 0 && (
              <ul className="py-2" role="listbox">
                {results.map((result, idx) => {
                  const Icon = typeIcons[result.type] ?? FileText;
                  const isSelected = idx === selectedIndex;
                  return (
                    <li key={`${result.type}-${result.id}`} role="option" aria-selected={isSelected}>
                      <button
                        onClick={() => navigateTo(result.href)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${
                          isSelected ? "bg-muted" : "hover:bg-muted/50"
                        }`}
                      >
                        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted shrink-0">
                          <Icon size={16} className="text-ink-muted" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink truncate">
                            {result.title}
                          </p>
                          <p className="text-xs text-ink-muted truncate">
                            {result.subtitle}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                          {typeLabels[result.type] ?? result.type}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {!loading && query.trim().length < 2 && (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-ink-muted">
                  Type at least 2 characters to search
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-line bg-muted/30">
            <p className="text-[10px] text-ink-muted">
              <kbd className="rounded border border-line bg-white px-1 py-0.5 text-[10px] font-medium">↑↓</kbd>
              {" "}navigate
              {" · "}
              <kbd className="rounded border border-line bg-white px-1 py-0.5 text-[10px] font-medium">↵</kbd>
              {" "}open
            </p>
            <p className="text-[10px] text-ink-muted">
              <kbd className="rounded border border-line bg-white px-1 py-0.5 text-[10px] font-medium">⌘K</kbd>
              {" "}toggle
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
