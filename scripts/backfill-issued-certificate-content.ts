/**
 * Backfill sale_certificates.issued_content for certificates issued before
 * migration 20261126. Run only with Matthew Wrigley's approval, after the
 * migration is applied and the code is deployed, and after a rehearsal.
 *
 * From the repository root. Dry run (writes nothing; lists what each
 * certificate would keep):
 *   JITI_ALIAS="{\"@/\":\"$PWD/src/\"}" npx jiti scripts/backfill-issued-certificate-content.ts
 * Write it:
 *   JITI_ALIAS="{\"@/\":\"$PWD/src/\"}" npx jiti scripts/backfill-issued-certificate-content.ts --apply
 * (The alias must be an absolute path.)
 *
 * It connects with DATABASE_URL (from .env), as the app does. Before --apply,
 * check each certificate's listed document (the wording, the building's name
 * and plan number, the lot number) against the certificate as given.
 */
import { backfillIssuedCertificateContent } from "../src/lib/records/issued-certificate-backfill";

async function main() {
  const apply = process.argv.includes("--apply");
  const kept = await backfillIssuedCertificateContent({ apply });
  console.log(JSON.stringify(kept, null, 2));
  console.log(apply ? `Kept ${kept.filter((k) => k.written).length} of ${kept.length} issued certificates.` : `Dry run: ${kept.length} issued certificates would be kept. Nothing was written.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
