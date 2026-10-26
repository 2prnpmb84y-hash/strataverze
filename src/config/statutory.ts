/**
 * Statutory rules, by jurisdiction.
 *
 * Each jurisdiction has its own file in `src/config/statutory/` (decided
 * 26 Oct 2026, multi-jurisdiction plan). This file is the index: code imports
 * statutory rules from `@/config/statutory`, never from a jurisdiction file.
 *
 * Only New South Wales is supported today, so the index exports the NSW rules
 * under their existing names. The jurisdiction work (phase 1) adds a resolver
 * that picks a scheme's rules by its jurisdiction and date, and no scheme
 * outside NSW can be created until its rules are added and reviewed.
 *
 * Plan: https://claude.ai/artifact/4mgrKi2E7VeBdSqTSgZhyc
 */
export * from "./statutory/nsw";
