/**
 * An in-memory stand-in for the Supabase Auth admin API (the parts the app
 * uses: createUser, getUserById, updateUserById), for tests, plus
 * findByEmail, a stand-in for the read of auth.users by address
 * (src/lib/invitations/auth-users.ts). Nothing here
 * talks to Supabase. Passwords are kept only to let a test check which
 * password was set; they are made-up test values.
 *
 * Use with:
 *   vi.mock("@/lib/supabase/admin", async () => {
 *     const { sharedFakeAuth } = await import("@/test/fake-supabase-admin");
 *     return { createAdminClient: () => sharedFakeAuth.client };
 *   });
 * and call sharedFakeAuth.reset() in beforeEach.
 */

export type FakeAuthUser = {
  id: string;
  email: string;
  email_confirmed_at?: string;
  confirmed_at?: string;
  last_sign_in_at?: string;
  password?: string;
};

type Err = { code: string; name: string; message: string };
const err = (code: string): Err => ({ code, name: "AuthApiError", message: code });

export function createFakeAuth() {
  const users = new Map<string, FakeAuthUser>();
  const calls = {
    createUser: [] as Record<string, unknown>[],
    getUserById: [] as string[],
    updateUserById: [] as { id: string; attributes: Record<string, unknown> }[],
  };
  const failures = { createUser: null as string | null, updateUserById: null as string | null };
  /** Called inside updateUserById, before it answers: lets a test do something mid-flow. */
  const hooks = { duringUpdateUserById: null as null | ((id: string) => void) };
  let next = 1;

  const admin = {
    async createUser(attributes: { email?: string; password?: string; email_confirm?: boolean }) {
      calls.createUser.push({ ...attributes });
      if (failures.createUser) return { data: { user: null }, error: err(failures.createUser) };
      const email = String(attributes.email ?? "").toLowerCase();
      if ([...users.values()].some((u) => u.email === email)) return { data: { user: null }, error: err("email_exists") };
      const user: FakeAuthUser = {
        id: `00000000-0000-4000-8000-${String(next++).padStart(12, "0")}`,
        email,
        ...(attributes.email_confirm ? { email_confirmed_at: "2026-11-01T00:00:00Z" } : {}),
        ...(attributes.password ? { password: attributes.password } : {}),
      };
      users.set(user.id, user);
      return { data: { user: { ...user } }, error: null };
    },
    async getUserById(id: string) {
      calls.getUserById.push(id);
      const user = users.get(id);
      return user ? { data: { user: { ...user } }, error: null } : { data: { user: null }, error: err("user_not_found") };
    },
    async updateUserById(id: string, attributes: { password?: string; email_confirm?: boolean }) {
      calls.updateUserById.push({ id, attributes: { ...attributes } });
      hooks.duringUpdateUserById?.(id);
      await Promise.resolve();
      if (failures.updateUserById) return { data: { user: null }, error: err(failures.updateUserById) };
      const user = users.get(id);
      if (!user) return { data: { user: null }, error: err("user_not_found") };
      if (attributes.password) user.password = attributes.password;
      if (attributes.email_confirm) user.email_confirmed_at = "2026-11-01T00:00:00Z";
      return { data: { user: { ...user } }, error: null };
    },
  };

  return {
    users,
    calls,
    failures,
    hooks,
    client: { auth: { admin } },
    /** As findAuthUsersByEmail reads auth.users: at most two, by lower-cased address. */
    async findByEmail(email: string) {
      const address = email.trim().toLowerCase();
      return [...users.values()]
        .filter((u) => u.email.toLowerCase() === address)
        .slice(0, 2)
        .map((u) => ({ id: u.id, confirmed: !!u.email_confirmed_at, signedIn: !!u.last_sign_in_at }));
    },
    /** An Auth user that exists already (someone who signed up, say). */
    addUser(user: FakeAuthUser) {
      users.set(user.id, { ...user });
    },
    reset() {
      users.clear();
      calls.createUser.length = 0;
      calls.getUserById.length = 0;
      calls.updateUserById.length = 0;
      failures.createUser = null;
      failures.updateUserById = null;
      hooks.duringUpdateUserById = null;
      next = 1;
    },
  };
}

export type FakeAuth = ReturnType<typeof createFakeAuth>;

/** One fake shared by a test file and its "@/lib/supabase/admin" mock. */
export const sharedFakeAuth = createFakeAuth();
