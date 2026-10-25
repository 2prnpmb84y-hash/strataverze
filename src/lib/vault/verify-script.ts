/**
 * The stand-alone check script shipped in every evidence package as
 * verify.mjs. It needs only Node.js (version 18 or later), no StrataVerze
 * code and no network. It must agree with src/lib/vault/chain.ts; the test
 * in verify-script.test.ts runs it against a package built by the app.
 *
 * Kept as plain JavaScript in a string so the package carries exactly what
 * runs. No template literals inside it.
 */
export const VERIFY_SCRIPT = String.raw`#!/usr/bin/env node
// StrataVerze evidence package check. Run in the unzipped folder:
//   node verify.mjs
// Exit code 0 when everything checks out, 1 otherwise.
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const problems = [];
const lines = [];

// 1. Each original file matches the fingerprint recorded for it.
for (const f of manifest.files) {
  const path = join(here, f.path);
  if (!existsSync(path)) { problems.push("Missing file: " + f.path); continue; }
  const actual = sha256(readFileSync(path));
  if (actual !== f.sha256) problems.push("File changed: " + f.path + " (" + f.title + ")");
  else lines.push("OK    " + f.path + "  " + f.title + " (version " + f.versionNo + ")");
}

// 2. The building's event chain is complete, linked and unchanged.
const events = [...manifest.events].sort((a, b) => a.seq - b.seq);
let prev = "0".repeat(64);
let recomputed = 0;
events.forEach((e, i) => {
  if (e.seq !== i + 1) problems.push("Event " + (i + 1) + " is missing.");
  if (e.prevHash !== prev) problems.push("Event " + e.seq + " does not link to the event before it.");
  if (!e.redacted) {
    const text = [e.prevHash, manifest.building.schemeId, String(e.seq), new Date(e.occurredAt).toISOString(), e.eventType,
      e.recordId || "", e.versionId || "", e.contentHash || "", e.actorProfileId || "", e.details].join("\n");
    if (sha256(Buffer.from(text, "utf8")) !== e.rowHash) problems.push("Event " + e.seq + " has been changed since it was recorded.");
    recomputed += 1;
  }
  prev = e.rowHash;
});

// 3. Each file is the one the chain says was captured.
for (const f of manifest.files) {
  const captured = events.find((e) => !e.redacted && e.versionId === f.versionId && e.contentHash === f.sha256);
  if (!captured) problems.push("No event in the chain records the capture of " + f.path + ".");
}

console.log(lines.join("\n"));
console.log("");
console.log("Files checked: " + manifest.files.length);
console.log("Events checked: " + events.length + " (" + recomputed + " recomputed, " + (events.length - recomputed) + " linked only, their details are not in this package)");
if (events.length) console.log("Last event: " + events[events.length - 1].seq + "  " + events[events.length - 1].rowHash);
if (problems.length) {
  console.log("");
  console.log("PROBLEMS FOUND:");
  for (const p of problems) console.log("  " + p);
  process.exit(1);
}
console.log("");
console.log("Everything checks out. See VERIFY.md for what this does and does not show.");
`;
