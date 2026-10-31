/**
 * Backfill sale_certificates.issued_content for certificates issued before
 * migration 20261126. Run only with Matthew Wrigley's approval, after the
 * migration is applied and the code is deployed, and after a rehearsal.
 *
 * From the repository root. Dry run (writes nothing; lists what each
 * certificate would keep, the pack it was issued under and the pack it
 * would be kept under):
 *   JITI_ALIAS="{\"@/\":\"$PWD/src/\"}" npx jiti scripts/backfill-issued-certificate-content.ts
 * Write it:
 *   JITI_ALIAS="{\"@/\":\"$PWD/src/\"}" npx jiti scripts/backfill-issued-certificate-content.ts --apply
 * (The alias must be an absolute path.) It refuses to write anything while
 * a certificate was issued under another pack or version than it would be
 * kept under, and names both. Once each such certificate is checked against
 * the certificate as given, add --allow-pack-mismatch.
 *
 * It connects with DATABASE_URL (from .env), as the app does. Before --apply,
 * check each certificate's listed document (the wording, the building's name
 * and plan number, the lot number) against the certificate as given.
 */
import { backfillIssuedCertificateContent } from "../src/lib/records/issued-certificate-backfill";

async function main() {
  const apply = process.argv.includes("--apply");
  const allowPackMismatch = process.argv.includes("--allow-pack-mismatch");
  const kept = await backfillIssuedCertificateContent({ apply, allowPackMismatch });
  console.log(JSON.stringify(kept, null, 2));
  for (const k of kept.filter((x) => !x.packMatches)) console.log(`Certificate ${k.number} (${k.id}): issued under ${k.rulePack ?? "no recorded rule pack"}, kept under ${k.keptUnder}.`);
  console.log(apply ? `Kept ${kept.filter((k) => k.written).length} of ${kept.length} issued certificates.` : `Dry run: ${kept.length} issued certificates would be kept. Nothing was written.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
