/**
 * An in-memory stand-in for the Supabase Auth admin API (the parts the app
 * uses: createUser, getUserById, updateUserById, deleteUser), for tests, plus
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
  phone_confirmed_at?: string;
  banned_until?: string;
  is_sso_user?: boolean;
  is_anonymous?: boolean;
  deleted_at?: string;
  user_metadata?: Record<string, unknown>;
  /** Stand-in for a pending sign-up confirmation token (a planted account has one). */
  confirmation_token?: string;
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
    deleteUser: [] as { id: string; soft: boolean | undefined }[],
  };
  const failures = {
    createUser: null as string | null,
    updateUserById: null as string | null,
    getUserById: null as string | null,
    deleteUser: null as string | null,
    /** updateUserById applies the change, then answers with this error (a timeout after the write, say). */
    updateUserByIdAfterApplying: null as string | null,
  };
  /** Called inside updateUserById, before it answers: lets a test do something mid-flow. */
  const hooks = { duringUpdateUserById: null as null | ((id: string) => void | Promise<void>) };
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
      if (failures.getUserById) return { data: { user: null }, error: err(failures.getUserById) };
      const user = users.get(id);
      return user ? { data: { user: { ...user } }, error: null } : { data: { user: null }, error: err("user_not_found") };
    },
    async updateUserById(id: string, attributes: { password?: string; email_confirm?: boolean }) {
      calls.updateUserById.push({ id, attributes: { ...attributes } });
      await hooks.duringUpdateUserById?.(id);
      if (failures.updateUserById) return { data: { user: null }, error: err(failures.updateUserById) };
      const user = users.get(id);
      if (!user) return { data: { user: null }, error: err("user_not_found") };
      if (attributes.password) user.password = attributes.password;
      if (attributes.email_confirm) user.email_confirmed_at = "2026-11-01T00:00:00Z";
      if (failures.updateUserByIdAfterApplying) return { data: { user: null }, error: err(failures.updateUserByIdAfterApplying) };
      return { data: { user: { ...user } }, error: null };
    },
    async deleteUser(id: string, shouldSoftDelete?: boolean) {
      calls.deleteUser.push({ id, soft: shouldSoftDelete });
      if (failures.deleteUser) return { data: { user: null }, error: err(failures.deleteUser) };
      const user = users.get(id);
      if (!user) return { data: { user: null }, error: err("user_not_found") };
      users.delete(id);
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
        .filter((u) => u.email.toLowerCase() === address && !u.is_sso_user && !u.is_anonymous && !u.deleted_at)
        .slice(0, 2)
        .map((u) => {
          const confirmed = !!(u.email_confirmed_at || u.confirmed_at || u.phone_confirmed_at);
          const signedIn = !!u.last_sign_in_at;
          const banned = !!u.banned_until && new Date(u.banned_until).getTime() > Date.now();
          return { id: u.id, confirmed, signedIn, banned, adoptable: !confirmed && !signedIn && !banned };
        });
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
      calls.deleteUser.length = 0;
      failures.createUser = null;
      failures.updateUserById = null;
      failures.getUserById = null;
      failures.deleteUser = null;
      failures.updateUserByIdAfterApplying = null;
      hooks.duringUpdateUserById = null;
      next = 1;
    },
  };
}

export type FakeAuth = ReturnType<typeof createFakeAuth>;

/** One fake shared by a test file and its "@/lib/supabase/admin" mock. */
export const sharedFakeAuth = createFakeAuth();
