import { SUPABASE_ROOT_CA_2021 } from "./certs/supabase-root-ca";

/**
 * How the app connects to the database (security stage S8, finding SEC-017).
 *
 * Before S8 the connection string had no `sslmode`, so node-postgres
 * connected without TLS. Now every connection to a non-local database is
 * encrypted, and by default the server's certificate is checked against
 * Supabase's root certificate authority and the host name.
 *
 * DATABASE_SSL (optional) chooses the mode:
 *   - verify  (default): TLS, certificate and host name checked.
 *   - require: TLS without checking the certificate. Only as a stop-gap if
 *              verification fails after a Supabase certificate change.
 *   - off:     no TLS. Only honoured for a database on this machine.
 * DATABASE_SSL_CA (optional) replaces the bundled certificate (PEM text;
 * "\n" may be written as a literal backslash-n).
 *
 * SSL settings in the connection string are removed, so these rules are the
 * only ones that apply (node-postgres would otherwise let the string win).
 */

export type SslMode = "verify" | "require" | "off";
export type SslConfig = false | { rejectUnauthorized: boolean; ca?: string };

// Everything in the query string that node-postgres would let override the
// TLS settings or the host the rules below are based on (review of S8).
const SSL_PARAMS = ["sslmode", "sslrootcert", "sslcert", "sslkey", "ssl", "uselibpqcompat", "sslnegotiation", "host", "hostaddr", "port"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLocalHost(host: string): boolean {
  return LOCAL_HOSTS.has(host.toLowerCase());
}

export function databaseConnection(env: Record<string, string | undefined> = process.env): {
  connectionString: string;
  ssl: SslConfig;
  mode: SslMode;
  warning?: string;
} {
  const raw = env.DATABASE_URL ?? "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // A missing or unusual URL never turns TLS off: the driver reports the
    // problem when it is used, and anything it can reach is verified.
    return { connectionString: raw, ssl: verifySsl(env) ?? { rejectUnauthorized: true }, mode: "verify", warning: "DATABASE_URL could not be read; TLS is required." };
  }
  for (const p of SSL_PARAMS) url.searchParams.delete(p);
  const connectionString = url.toString();
  const local = isLocalHost(url.hostname);

  const requested = (env.DATABASE_SSL ?? "").trim().toLowerCase();
  let mode: SslMode = requested === "require" || requested === "off" || requested === "verify" ? requested : local ? "off" : "verify";
  let warning: string | undefined;
  if (mode === "off" && !local) {
    mode = "verify";
    warning = "DATABASE_SSL=off is ignored for a database on another machine.";
  }
  if (mode === "off") return { connectionString, ssl: false, mode };
  if (mode === "require") {
    return { connectionString, ssl: { rejectUnauthorized: false }, mode, warning: "Database TLS certificate is not being checked (DATABASE_SSL=require)." };
  }
  const verified = verifySsl(env);
  if (!verified) {
    return {
      connectionString,
      ssl: { rejectUnauthorized: false },
      mode: "require",
      warning: "No database CA certificate is available, so the connection is encrypted but not verified.",
    };
  }
  return { connectionString, ssl: verified, mode, warning };
}

/** Verified TLS with the configured or bundled Supabase CA, or null when none is available. */
function verifySsl(env: Record<string, string | undefined>): { rejectUnauthorized: true; ca: string } | null {
  const ca = (env.DATABASE_SSL_CA?.replace(/\\n/g, "\n").trim() || SUPABASE_ROOT_CA_2021 || "").trim();
  return ca ? { rejectUnauthorized: true, ca } : null;
}

/**
 * The connection string for the Prisma CLI (migrations, verify, infer), with
 * verified TLS for any database not on this machine. The CLI takes a plain
 * string, so the CA is given as a file (prisma/certs).
 */
export function cliConnectionString(raw: string | undefined, caFile: string): string {
  if (!raw) return raw ?? "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  for (const p of SSL_PARAMS) url.searchParams.delete(p);
  if (isLocalHost(url.hostname)) return url.toString();
  url.searchParams.set("sslmode", "verify-full");
  url.searchParams.set("sslrootcert", caFile);
  return url.toString();
}
