/**
 * Supabase's public root certificate authority ("Supabase Root 2021 CA"),
 * from the "Download certificate" link in the project's database settings
 * (prod-ca-2021.crt). It is public, not a secret. The app uses it to check
 * it is really talking to Supabase's database (S8, SEC-017).
 *
 * Filled in once the certificate is supplied; until then the connection is
 * encrypted but the server's certificate is not checked.
 */
export const SUPABASE_ROOT_CA_2021: string | null = null;
