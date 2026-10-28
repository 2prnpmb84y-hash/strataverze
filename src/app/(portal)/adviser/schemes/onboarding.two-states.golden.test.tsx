/**
 * The Add Property wizard's first page as everyone sees it since the
 * Queensland switch-on (golden, recorded on feat/qld-switch-on, 28 Oct 2026),
 * with the real state settings: New South Wales and Queensland, New South
 * Wales chosen by default, the state asked first, and the page and help
 * naming both. onboarding.nsw.golden.test.tsx keeps the NSW-only page it was
 * recorded with, to show nothing else changed.
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const TODAY = "2026-10-27";

const mocks = vi.hoisted(() => ({
  createScheme: vi.fn(async () => ({ id: "scheme-1" })),
  stage: vi.fn(async (): Promise<string | null> => "batch-1"),
}));

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => ({ id: "admin", isPlatformAdmin: true })) }));
vi.mock("@/lib/jurisdiction/time-zone", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/time-zone")>("@/lib/jurisdiction/time-zone");
  return { ...actual, platformToday: () => TODAY, todayIn: () => TODAY };
});
vi.mock("@/lib/storage/client-upload", () => ({ stageUpload: vi.fn() }));
vi.mock("@/lib/actions/scheme-photo", () => ({ setSchemePhotoAction: vi.fn() }));
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>("@/lib/auth/require-membership");
  return { ...actual, requirePlatformAdmin: vi.fn(async () => ({ id: "admin" })) };
});
vi.mock("@/lib/auth/mfa-enforcement", () => ({ requireRecentMfa: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/schemes", () => ({ createScheme: mocks.createScheme, updateScheme: vi.fn(), deleteScheme: vi.fn() }));
vi.mock("@/lib/onboarding/stage-opening-cutover", () => ({ stageOnboardingCutover: mocks.stage }));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/prisma/db", () => {
  const chain = { where: () => chain, first: async () => null };
  return { db: { orm: { public: { Scheme: chain } } } };
});

const { default: NewSchemePage } = await import("./new/page");

describe("Add Property wizard with both live states (golden)", () => {
  it("shows the first page with New South Wales and Queensland to choose from", async () => {
    render(await NewSchemePage());
    const select = document.querySelector('[name="state"]') as HTMLSelectElement;
    expect([...select.options].filter((o) => o.value).map((o) => o.value)).toEqual(["NSW", "QLD"]);
    expect(select.value).toBe("NSW");
    expect(document.body.innerHTML).toMatchSnapshot("page");
  });
});
