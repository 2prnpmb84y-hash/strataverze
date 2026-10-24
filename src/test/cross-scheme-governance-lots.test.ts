import { beforeEach, describe, expect, it, vi } from "vitest";

// MFA step-up (stage S4) is tested in src/lib/auth/mfa-enforcement.test.ts.
// Here the caller has verified recently unless a test says otherwise.
const stepUp = vi.hoisted(() => ({ requireRecentMfa: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/mfa-enforcement", () => ({
  requireRecentMfa: stepUp.requireRecentMfa,
  getMfaStatus: vi.fn(async () => null),
  enforceMfa: vi.fn(async () => {}),
  enforceMfaFor: vi.fn(async () => {}),
  StepUpRequiredError: class extends Error {},
}));

/**
 * Cross-scheme tests for the adviser lots, meetings, minutes and members
 * actions and the owner-portal voting actions (security finding SEC-004 and
 * the S1 review findings C1, H1, H3, H6, F6, F8, L1). Each action is called
 * directly, as an attacker would call it, with scheme A and a record that
 * belongs to scheme B, and the test asserts the mutator is never reached.
 */

const SCHEME_A = "aaaaaaaa-0000-0000-0000-000000000001";
const SCHEME_B = "bbbbbbbb-0000-0000-0000-000000000002";

const caller = { id: "caller-profile", firstName: "Casey", lastName: "Caller" };

// Roles the caller holds, per scheme. The membership mock enforces them the
// way the real requireSchemeMembership does.
let callerRoles: Record<string, string[]> = {};

vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>(
    "@/lib/auth/require-membership",
  );
  return {
    ...actual,
    requireAuth: vi.fn(async () => caller),
    requireSchemeMembership: vi.fn(async (schemeId: string, allowed: string[]) => {
      const roles = callerRoles[schemeId] ?? [];
      const role = roles.find((r) => allowed.includes(r));
      if (!role) throw new actual.AuthorisationError("You do not have permission to perform this action.");
      return { profile: caller, membership: { role, schemeId }, roles };
    }),
  };
});

// A chainable stand-in for db.orm.public.<Model>: every builder method
// returns the chain; first/all/update/delete/create are per-model mocks.
type Terminal = "first" | "all" | "update" | "delete" | "create";
type AsyncMock = ReturnType<typeof vi.fn<(...a: unknown[]) => Promise<unknown>>>;
const terminals: Record<string, Record<Terminal, AsyncMock>> = {};
function model(name: string) {
  if (!terminals[name]) {
    terminals[name] = {
      first: vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => null),
      all: vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => []),
      update: vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => null),
      delete: vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => null),
      create: vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({ id: "new" })),
    };
  }
  const t = terminals[name];
  const chain: Record<string, unknown> = {};
  for (const m of ["where", "include", "orderBy", "limit", "select"]) chain[m] = () => chain;
  for (const op of Object.keys(t) as Terminal[]) chain[op] = (...a: unknown[]) => t[op](...a);
  return chain;
}
vi.mock("@/prisma/db", () => ({
  db: {
    orm: { public: new Proxy({}, { get: (_t, name: string) => model(name) }) },
    transaction: vi.fn(),
  },
}));
vi.mock("@prisma/orm-postgres/orm-client", () => ({
  and: (...c: unknown[]) => c,
  or: (...c: unknown[]) => c,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const lots = {
  getLotInScheme: vi.fn(),
  createLot: vi.fn(),
  updateLot: vi.fn(),
  deleteLot: vi.fn(),
  assignOwnerToLot: vi.fn(),
  removeOwnerFromLot: vi.fn(),
};
vi.mock("@/lib/queries/lots", () => lots);

const lotWorkflows = {
  upsertLotDetail: vi.fn(),
  upsertTenant: vi.fn(),
  upsertPropertyManager: vi.fn(),
  upsertDeliveryPreference: vi.fn(),
  upsertDebtCollection: vi.fn(),
  createPowerOfAttorney: vi.fn(),
  revokePowerOfAttorney: vi.fn(),
  createProxy: vi.fn(),
  revokeProxy: vi.fn(),
};
vi.mock("@/lib/queries/lot-workflows", () => lotWorkflows);

const meetings = {
  getMeetingById: vi.fn(),
  updateMeeting: vi.fn(),
  deleteMeeting: vi.fn(),
};
vi.mock("@/lib/queries/meetings", () => meetings);

const motions = {
  createMotion: vi.fn(),
  updateMotion: vi.fn(),
  deleteMotion: vi.fn(),
  getMotionById: vi.fn(),
  castVote: vi.fn(),
  MOTION_STATUSES: ["DRAFT", "OPEN", "CARRIED", "DEFEATED", "PASSED", "WITHDRAWN"],
  VOTE_VALUES: ["FOR", "AGAINST", "ABSTAIN"],
};
vi.mock("@/lib/queries/motions", () => motions);

const minutes = {
  createMinutes: vi.fn(),
  getLatestMinutes: vi.fn(),
  getMinutesForMeeting: vi.fn(),
  updateMinutes: vi.fn(),
};
vi.mock("@/lib/queries/minutes", () => minutes);

const agenda = {
  getAgendaItem: vi.fn(),
  getAgendaItemsForMeeting: vi.fn(async () => []),
  updateAgendaItem: vi.fn(),
};
vi.mock("@/lib/queries/agenda", () => agenda);

const evoting = {
  getBallotForMeeting: vi.fn(),
  castElectronicVote: vi.fn(),
};
vi.mock("@/lib/queries/evoting", () => evoting);

const invitations = { revokeInvitation: vi.fn(), createInvitation: vi.fn() };
vi.mock("@/lib/queries/invitations", () => invitations);

const documents = {
  getDocumentById: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
};
vi.mock("@/lib/queries/documents", () => documents);
const resolveDocumentUrl = vi.fn(async () => "https://signed.example/doc");
vi.mock("@/lib/queries/document-url", () => ({ resolveDocumentUrl }));
// Document visibility (S3): the caller's roles on each scheme, no lots.
vi.mock("@/lib/documents/viewers", () => ({
  documentViewers: async (_p: string, ids: string[]) =>
    new Map(ids.map((id) => [id, { roles: callerRoles[id] ?? [], ownLotNumbers: [] }])),
}));

vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/queries/schemes", () => ({
  getSchemeById: vi.fn(async (id: string) => ({ id, state: "NSW", name: "Scheme", planNumber: "SP1" })),
  getSchemeNameById: vi.fn(async () => "Scheme"),
  getMemberEmailsForScheme: vi.fn(async () => []),
}));
vi.mock("@/lib/notifications", () => ({
  notifyMeetingScheduled: vi.fn(async () => {}),
  notifyInvitation: vi.fn(async () => {}),
}));
vi.mock("@/lib/meetings/rule-set-repo", () => ({ getActiveRuleSet: vi.fn(async () => ({})) }));
vi.mock("@/lib/meetings/events", () => ({ recordMeetingEvent: vi.fn() }));
vi.mock("@/lib/meetings/setup", () => ({
  validateMeetingSetup: vi.fn(() => ({ errors: {} })),
  createMeetingWithRuleSnapshot: vi.fn(),
  DEFAULT_TIMEZONE: "Australia/Sydney",
  normaliseMeetingType: (v: string) => {
    const u = (v ?? "").toUpperCase();
    if (u === "SGM") return "EGM";
    return ["AGM", "EGM", "COMMITTEE", "FIRST_AGM"].includes(u) ? u : null;
  },
}));
vi.mock("@/lib/billing/capture", () => ({ quoteUsageFee: vi.fn(async () => null) }));
vi.mock("@/lib/billing/disclosure", () => ({
  confirmedCentsFrom: vi.fn(),
  feeErrorMessage: () => null,
  resolveDisclosure: vi.fn(),
}));

const lotActions = await import("@/app/(portal)/adviser/schemes/[id]/lots/actions");
const lotWorkflowActions = await import("@/app/(portal)/adviser/schemes/[id]/lots/[lotId]/lot-workflow-actions");
const meetingActions = await import("@/app/(portal)/adviser/schemes/[id]/meetings/actions");
const minutesActions = await import("@/app/(portal)/adviser/schemes/[id]/meetings/[meetingId]/minutes-actions");
const memberActions = await import("@/app/(portal)/adviser/schemes/[id]/members/actions");
const documentActions = await import("@/app/(portal)/adviser/schemes/[id]/documents/actions");
const ownerMeetingActions = await import("@/app/(portal)/owner/(scheme)/meetings/actions");
const committeeActions = await import("@/app/(portal)/owner/(scheme)/governance/[meetingId]/actions");
const { searchProfiles } = await vi.importActual<typeof import("@/lib/queries/profiles")>(
  "@/lib/queries/profiles",
);

// Fixtures: one of each record in scheme A and in scheme B.
const LOT_A = { id: "lot-a", schemeId: SCHEME_A, entitlement: 10 };
const LOT_B = { id: "lot-b", schemeId: SCHEME_B, entitlement: 10 };
const MEETING_A = { id: "meeting-a", schemeId: SCHEME_A, status: "SCHEDULED", meetingType: "AGM" };
const MEETING_A2 = { id: "meeting-a2", schemeId: SCHEME_A, status: "SCHEDULED", meetingType: "AGM" };
const MEETING_B = { id: "meeting-b", schemeId: SCHEME_B, status: "SCHEDULED", meetingType: "AGM" };
const MEETING_C = { id: "meeting-c", schemeId: SCHEME_A, status: "SCHEDULED", meetingType: "COMMITTEE" };
const motion = (id: string, schemeId: string, meetingId: string | null, status = "OPEN") => ({
  id,
  schemeId,
  meetingId,
  status,
  votes: [] as { profileId: string }[],
});

function lotForm() {
  const fd = new FormData();
  fd.set("lotNumber", "1");
  fd.set("entitlement", "10");
  fd.set("lotType", "RESIDENTIAL");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  callerRoles = { [SCHEME_A]: ["ADVISER"] };
  const allLots = [LOT_A, LOT_B];
  lots.getLotInScheme.mockImplementation(async (schemeId: string, lotId: string) =>
    allLots.find((l) => l.id === lotId && l.schemeId === schemeId) ?? null,
  );
  const allMeetings = [MEETING_A, MEETING_A2, MEETING_B, MEETING_C];
  meetings.getMeetingById.mockImplementation(async (id: string) =>
    allMeetings.find((m) => m.id === id) ?? null,
  );
  motions.getMotionById.mockResolvedValue(null);
  for (const t of Object.values(terminals)) {
    t.first.mockResolvedValue(null);
    t.all.mockResolvedValue([]);
  }
});

describe("lots (C1)", () => {
  it("deleteLotAction refuses a lot from another scheme", async () => {
    const r = await lotActions.deleteLotAction(SCHEME_A, LOT_B.id);
    expect(r?.error).toBe("Lot not found.");
    expect(lots.deleteLot).not.toHaveBeenCalled();
  });

  it("updateLotAction refuses a lot from another scheme", async () => {
    const r = await lotActions.updateLotAction(SCHEME_A, LOT_B.id, {}, lotForm());
    expect(r.error).toBe("Lot not found.");
    expect(lots.updateLot).not.toHaveBeenCalled();
  });

  it("updateLotAction still updates the scheme's own lot, scoped to the scheme", async () => {
    const r = await lotActions.updateLotAction(SCHEME_A, LOT_A.id, {}, lotForm());
    expect(r.error).toBeUndefined();
    expect(lots.updateLot).toHaveBeenCalledWith(SCHEME_A, LOT_A.id, expect.any(Object));
  });

  it("assignOwnerAction refuses a lot from another scheme", async () => {
    const r = await lotActions.assignOwnerAction(SCHEME_A, LOT_B.id, "someone");
    expect(r.error).toBe("Lot not found.");
    expect(lots.assignOwnerToLot).not.toHaveBeenCalled();
  });

  it("an adviser of scheme B cannot act through scheme A's id", async () => {
    callerRoles = { [SCHEME_B]: ["ADVISER"], [SCHEME_A]: ["OWNER"] };
    const r = await lotActions.deleteLotAction(SCHEME_A, LOT_A.id);
    expect(r?.error).toMatch(/permission/);
    expect(lots.deleteLot).not.toHaveBeenCalled();
  });
});

describe("lot workflow actions (C1)", () => {
  it("updateTenantAction refuses a lot from another scheme", async () => {
    const r = await lotWorkflowActions.updateTenantAction(SCHEME_A, LOT_B.id, 1, new FormData());
    expect(r.error).toBe("Lot not found.");
    expect(lotWorkflows.upsertTenant).not.toHaveBeenCalled();
  });

  it("revokeProxyAction refuses a lot from another scheme", async () => {
    const r = await lotWorkflowActions.revokeProxyAction(SCHEME_A, LOT_B.id, "proxy-b");
    expect(r.error).toBe("Lot not found.");
    expect(lotWorkflows.revokeProxy).not.toHaveBeenCalled();
  });

  it("revokePowerOfAttorneyAction scopes the record to the lot", async () => {
    const r = await lotWorkflowActions.revokePowerOfAttorneyAction(SCHEME_A, LOT_A.id, "poa-1");
    expect(r.error).toBeUndefined();
    expect(lotWorkflows.revokePowerOfAttorney).toHaveBeenCalledWith(LOT_A.id, "poa-1");
  });
});

describe("searchProfiles (H6)", () => {
  const fullRow = {
    id: "p1",
    firstName: "Pat",
    lastName: "Lee",
    email: "pat@example.com",
    phone: "0400000000",
    authId: "auth-secret",
    isPlatformAdmin: true,
  };

  it("needs at least 3 characters and does not query profiles otherwise", async () => {
    expect(await searchProfiles("pa", SCHEME_A)).toEqual([]);
    expect(terminals.Profile?.all ?? vi.fn()).not.toHaveBeenCalled();
  });

  it("returns only id, names and email, never authId, phone or isPlatformAdmin", async () => {
    model("Profile");
    terminals.Profile.all.mockResolvedValueOnce([fullRow]);
    const r = await searchProfiles("pat@example.com", SCHEME_A);
    expect(r).toEqual([{ id: "p1", firstName: "Pat", lastName: "Lee", email: "pat@example.com" }]);
    expect(Object.keys(r[0]).sort()).toEqual(["email", "firstName", "id", "lastName"]);
  });

  it("runs only the exact-email query when nobody is connected to the scheme", async () => {
    model("Profile");
    terminals.Profile.all.mockResolvedValue([]);
    await searchProfiles("pat", SCHEME_A);
    expect(terminals.Profile.all).toHaveBeenCalledTimes(1);
  });
});

describe("adviser meetings and motions (H1, L3)", () => {
  it("deleteMeetingAction refuses a meeting from another scheme", async () => {
    const r = await meetingActions.deleteMeetingAction(SCHEME_A, MEETING_B.id);
    expect(r?.error).toBe("Meeting not found.");
    expect(meetings.deleteMeeting).not.toHaveBeenCalled();
  });

  it("cancelMeetingAction refuses a meeting from another scheme", async () => {
    const r = await meetingActions.cancelMeetingAction(SCHEME_A, MEETING_B.id);
    expect(r.error).toBe("Meeting not found.");
    expect(meetings.updateMeeting).not.toHaveBeenCalled();
  });

  it("updateMotionStatusAction refuses a motion from another scheme", async () => {
    motions.getMotionById.mockResolvedValue(motion("motion-b", SCHEME_B, MEETING_B.id));
    const r = await meetingActions.updateMotionStatusAction(SCHEME_A, MEETING_A.id, "motion-b", "CARRIED");
    expect(r.error).toBe("Motion not found.");
    expect(motions.updateMotion).not.toHaveBeenCalled();
  });

  it("updateMotionStatusAction refuses a motion from another meeting of the same scheme", async () => {
    motions.getMotionById.mockResolvedValue(motion("motion-a2", SCHEME_A, MEETING_A2.id));
    const r = await meetingActions.updateMotionStatusAction(SCHEME_A, MEETING_A.id, "motion-a2", "CARRIED");
    expect(r.error).toBe("Motion not found.");
    expect(motions.updateMotion).not.toHaveBeenCalled();
  });

  it("updateMotionStatusAction rejects a free-text status", async () => {
    motions.getMotionById.mockResolvedValue(motion("motion-a", SCHEME_A, MEETING_A.id));
    const r = await meetingActions.updateMotionStatusAction(SCHEME_A, MEETING_A.id, "motion-a", "HACKED");
    expect(r.error).toBe("Invalid motion status.");
    expect(motions.updateMotion).not.toHaveBeenCalled();
  });

  it("deleteMotionAction refuses a motion from another scheme", async () => {
    motions.getMotionById.mockResolvedValue(motion("motion-b", SCHEME_B, MEETING_B.id));
    const r = await meetingActions.deleteMotionAction(SCHEME_A, MEETING_A.id, "motion-b");
    expect(r.error).toBe("Motion not found.");
    expect(motions.deleteMotion).not.toHaveBeenCalled();
  });

  it("createMotionAction refuses a meeting from another scheme", async () => {
    const fd = new FormData();
    fd.set("title", "t");
    fd.set("description", "d");
    fd.set("motionType", "ORDINARY");
    const r = await meetingActions.createMotionAction(SCHEME_A, MEETING_B.id, {}, fd);
    expect(r.error).toBe("Meeting not found.");
    expect(motions.createMotion).not.toHaveBeenCalled();
  });

  it("no longer exposes an adviser vote action", () => {
    expect("castVoteAction" in meetingActions).toBe(false);
  });
});

describe("minutes (H1)", () => {
  it("confirmMinutesAction refuses a meeting from another scheme", async () => {
    minutes.getLatestMinutes.mockResolvedValue({ id: "min-b", meetingId: MEETING_B.id, state: "DRAFT", version: 1 });
    const r = await minutesActions.confirmMinutesAction(SCHEME_A, MEETING_B.id);
    expect(r.error).toBe("Meeting not found.");
    expect(minutes.updateMinutes).not.toHaveBeenCalled();
  });

  it("publishMinutesAction refuses a meeting from another scheme", async () => {
    minutes.getLatestMinutes.mockResolvedValue({ id: "min-b", meetingId: MEETING_B.id, state: "CONFIRMED", version: 1 });
    const r = await minutesActions.publishMinutesAction(SCHEME_A, MEETING_B.id);
    expect(r.error).toBe("Meeting not found.");
    expect(minutes.updateMinutes).not.toHaveBeenCalled();
    expect(meetings.updateMeeting).not.toHaveBeenCalled();
  });
});

describe("members (H3)", () => {
  it("revokeInvitationAction refuses an invitation from another scheme", async () => {
    model("Invitation");
    terminals.Invitation.first.mockResolvedValue({ id: "inv-b", schemeId: SCHEME_B, status: "PENDING" });
    const r = await memberActions.revokeInvitationAction(SCHEME_A, "inv-b");
    expect(r.error).toBe("Invitation not found.");
    expect(invitations.revokeInvitation).not.toHaveBeenCalled();
  });

  it("revokeInvitationAction refuses an unknown invitation id", async () => {
    const r = await memberActions.revokeInvitationAction(SCHEME_A, "missing");
    expect(r.error).toBe("Invitation not found.");
    expect(invitations.revokeInvitation).not.toHaveBeenCalled();
  });
});

describe("document signed URLs (L1)", () => {
  it("signs only a document of the scheme, by id", async () => {
    documents.getDocumentById.mockResolvedValue({ id: "doc-b", schemeId: SCHEME_B, fileUrl: "scheme-b/secret.pdf" });
    const r = await documentActions.getDocumentSignedUrlAction(SCHEME_A, "doc-b");
    expect(r.error).toBe("Document not found.");
    expect(resolveDocumentUrl).not.toHaveBeenCalled();
  });

  it("signs the record's own fileUrl", async () => {
    const path = `schemes/${SCHEME_A}/levy.pdf`;
    documents.getDocumentById.mockResolvedValue({ id: "doc-a", schemeId: SCHEME_A, fileUrl: path });
    const r = await documentActions.getDocumentSignedUrlAction(SCHEME_A, "doc-a");
    expect(r.url).toBeDefined();
    // Signed only within this scheme's folder of the documents bucket.
    expect(resolveDocumentUrl).toHaveBeenCalledWith(path, 600, { schemeId: SCHEME_A });
  });

  it("refuses a document the caller may not see (S3 visibility)", async () => {
    callerRoles = { [SCHEME_A]: ["OWNER"] };
    for (const visibility of ["MANAGEMENT", "COMMITTEE", "LOT_OWNERS"]) {
      documents.getDocumentById.mockResolvedValue({ id: "doc-a", schemeId: SCHEME_A, fileUrl: `schemes/${SCHEME_A}/x.pdf`, visibility, lotNumber: "9" });
      const r = await documentActions.getDocumentSignedUrlAction(SCHEME_A, "doc-a");
      expect(r.error, visibility).toBe("Document not found.");
    }
    expect(resolveDocumentUrl).not.toHaveBeenCalled();
  });

  it("refuses a supplier", async () => {
    callerRoles = { [SCHEME_A]: ["SUPPLIER"] };
    documents.getDocumentById.mockResolvedValue({ id: "doc-a", schemeId: SCHEME_A, fileUrl: "scheme-a/levy.pdf" });
    const r = await documentActions.getDocumentSignedUrlAction(SCHEME_A, "doc-a");
    expect(r.error).toMatch(/permission/);
    expect(resolveDocumentUrl).not.toHaveBeenCalled();
  });
});

describe("owner castVoteAction (F8)", () => {
  const ownerMembership = { id: "m1", schemeId: SCHEME_A, profileId: caller.id, role: "OWNER", lotId: LOT_A.id, isActive: true };

  beforeEach(() => {
    callerRoles = { [SCHEME_A]: ["OWNER"] };
    model("SchemeMembership");
    terminals.SchemeMembership.all.mockResolvedValue([ownerMembership]);
  });

  it("refuses a motion on a scheme where the caller is not an owner", async () => {
    motions.getMotionById.mockResolvedValue(motion("motion-b", SCHEME_B, MEETING_B.id));
    const r = await ownerMeetingActions.castVoteAction("motion-b", "FOR");
    expect(r.error).toMatch(/permission/);
    expect(motions.castVote).not.toHaveBeenCalled();
  });

  it("refuses an owner voting on a committee meeting's motion", async () => {
    motions.getMotionById.mockResolvedValue(motion("motion-c", SCHEME_A, MEETING_C.id));
    const r = await ownerMeetingActions.castVoteAction("motion-c", "FOR");
    expect(r.error).toMatch(/voted on by the committee/);
    expect(motions.castVote).not.toHaveBeenCalled();
  });

  it("refuses a supplier or accountant membership", async () => {
    callerRoles = { [SCHEME_A]: ["SUPPLIER", "ACCOUNTANT"] };
    motions.getMotionById.mockResolvedValue(motion("motion-a", SCHEME_A, MEETING_A.id));
    const r = await ownerMeetingActions.castVoteAction("motion-a", "FOR");
    expect(r.error).toMatch(/permission/);
    expect(motions.castVote).not.toHaveBeenCalled();
  });

  it("refuses a motion whose meeting belongs to another scheme", async () => {
    motions.getMotionById.mockResolvedValue(motion("motion-x", SCHEME_A, MEETING_B.id));
    const r = await ownerMeetingActions.castVoteAction("motion-x", "FOR");
    expect(r.error).toBe("Motion not found.");
    expect(motions.castVote).not.toHaveBeenCalled();
  });

  it("refuses a motion that is not open", async () => {
    motions.getMotionById.mockResolvedValue(motion("motion-a", SCHEME_A, MEETING_A.id, "CARRIED"));
    const r = await ownerMeetingActions.castVoteAction("motion-a", "FOR");
    expect(r.error).toMatch(/not open/);
    expect(motions.castVote).not.toHaveBeenCalled();
  });

  it("refuses a vote value outside the allow-list", async () => {
    motions.getMotionById.mockResolvedValue(motion("motion-a", SCHEME_A, MEETING_A.id));
    const r = await ownerMeetingActions.castVoteAction("motion-a", "FOR;DROP");
    expect(r.error).toBe("Invalid vote value.");
    expect(motions.castVote).not.toHaveBeenCalled();
  });

  it("refuses a second vote for the same lot by a co-owner", async () => {
    const m = motion("motion-a", SCHEME_A, MEETING_A.id);
    m.votes = [{ profileId: "co-owner" }];
    motions.getMotionById.mockResolvedValue(m);
    terminals.SchemeMembership.all
      .mockResolvedValueOnce([ownerMembership])
      .mockResolvedValueOnce([ownerMembership, { ...ownerMembership, id: "m2", profileId: "co-owner" }]);
    const r = await ownerMeetingActions.castVoteAction("motion-a", "FOR");
    expect(r.error).toMatch(/already been cast for your lot/);
    expect(motions.castVote).not.toHaveBeenCalled();
  });

  it("records a lot owner's vote on an open motion of their scheme", async () => {
    motions.getMotionById.mockResolvedValue(motion("motion-a", SCHEME_A, MEETING_A.id));
    const r = await ownerMeetingActions.castVoteAction("motion-a", "AGAINST");
    expect(r.error).toBeUndefined();
    expect(motions.castVote).toHaveBeenCalledWith({ motionId: "motion-a", profileId: caller.id, voteValue: "AGAINST" });
  });
});

describe("owner castBallotVoteAction (F8)", () => {
  const ownerMembership = { id: "m1", schemeId: SCHEME_A, profileId: caller.id, role: "OWNER", lotId: LOT_A.id, isActive: true };
  const openBallot = {
    id: "ballot-a",
    status: "OPEN",
    opensAt: new Date(Date.now() - 86_400_000).toISOString(),
    closesAt: new Date(Date.now() + 86_400_000).toISOString(),
  };

  beforeEach(() => {
    callerRoles = { [SCHEME_A]: ["OWNER"] };
    model("SchemeMembership");
    terminals.SchemeMembership.all.mockResolvedValue([ownerMembership]);
    model("Lot");
    terminals.Lot.first.mockResolvedValue(LOT_A);
    evoting.getBallotForMeeting.mockResolvedValue(openBallot);
  });

  it("refuses an agenda item that is not on the ballot's meeting", async () => {
    agenda.getAgendaItem.mockResolvedValue(null);
    const r = await ownerMeetingActions.castBallotVoteAction(MEETING_A.id, "item-from-b", "FOR");
    expect(r.error).toBe("Agenda item not found.");
    expect(evoting.castElectronicVote).not.toHaveBeenCalled();
  });

  it("refuses a supplier membership that happens to carry a lot", async () => {
    callerRoles = { [SCHEME_A]: ["SUPPLIER"] };
    agenda.getAgendaItem.mockResolvedValue({ id: "item-a", meetingId: MEETING_A.id });
    const r = await ownerMeetingActions.castBallotVoteAction(MEETING_A.id, "item-a", "FOR");
    expect(r.error).toMatch(/permission/);
    expect(evoting.castElectronicVote).not.toHaveBeenCalled();
  });

  it("refuses a vote value outside the allow-list", async () => {
    agenda.getAgendaItem.mockResolvedValue({ id: "item-a", meetingId: MEETING_A.id });
    const r = await ownerMeetingActions.castBallotVoteAction(MEETING_A.id, "item-a", "MAYBE");
    expect(r.error).toBe("Invalid vote value.");
    expect(evoting.castElectronicVote).not.toHaveBeenCalled();
  });

  it("records the vote against the owner's lot", async () => {
    agenda.getAgendaItem.mockResolvedValue({ id: "item-a", meetingId: MEETING_A.id });
    const r = await ownerMeetingActions.castBallotVoteAction(MEETING_A.id, "item-a", "FOR");
    expect(r.error).toBeUndefined();
    expect(evoting.castElectronicVote).toHaveBeenCalledWith(
      expect.objectContaining({ ballotId: "ballot-a", agendaItemId: "item-a", lotId: LOT_A.id, voteValue: "FOR" }),
    );
  });
});

describe("committee voting (F6)", () => {
  it("refuses a plain owner", async () => {
    callerRoles = { [SCHEME_A]: ["OWNER"] };
    motions.getMotionById.mockResolvedValue(motion("motion-a", SCHEME_A, MEETING_A.id));
    const r = await committeeActions.castCommitteeVoteAction(MEETING_A.id, "motion-a", "FOR");
    expect(r.error).toMatch(/permission/);
    expect(motions.castVote).not.toHaveBeenCalled();
  });

  it("refuses a motion that belongs to another meeting", async () => {
    callerRoles = { [SCHEME_A]: ["COMMITTEE"] };
    motions.getMotionById.mockResolvedValue(motion("motion-b", SCHEME_B, MEETING_B.id));
    const r = await committeeActions.castCommitteeVoteAction(MEETING_A.id, "motion-b", "FOR");
    expect(r.error).toBe("Motion not found.");
    expect(motions.castVote).not.toHaveBeenCalled();
  });

  it("refuses a vote value outside the allow-list", async () => {
    callerRoles = { [SCHEME_A]: ["COMMITTEE"] };
    motions.getMotionById.mockResolvedValue(motion("motion-a", SCHEME_A, MEETING_A.id));
    const r = await committeeActions.castCommitteeVoteAction(MEETING_A.id, "motion-a", "YES");
    expect(r.error).toBe("Invalid vote value.");
    expect(motions.castVote).not.toHaveBeenCalled();
  });

  it("refuses a committee vote on a general meeting motion", async () => {
    callerRoles = { [SCHEME_A]: ["COMMITTEE"] };
    motions.getMotionById.mockResolvedValue(motion("motion-a", SCHEME_A, MEETING_A.id));
    const r = await committeeActions.castCommitteeVoteAction(MEETING_A.id, "motion-a", "FOR");
    expect(r.error).toMatch(/voted on by owners/);
    expect(motions.castVote).not.toHaveBeenCalled();
  });

  it("refuses a committee motion on a general meeting", async () => {
    callerRoles = { [SCHEME_A]: ["COMMITTEE"] };
    const fd = new FormData();
    fd.set("title", "t");
    fd.set("description", "d");
    const r = await committeeActions.createCommitteeMotionAction(MEETING_A.id, {}, fd);
    expect(r.error).toMatch(/committee meetings/);
    expect(motions.createMotion).not.toHaveBeenCalled();
  });

  it("refuses a plain owner raising a committee motion", async () => {
    callerRoles = { [SCHEME_A]: ["OWNER"] };
    const fd = new FormData();
    fd.set("title", "t");
    fd.set("description", "d");
    const r = await committeeActions.createCommitteeMotionAction(MEETING_A.id, {}, fd);
    expect(r.error).toMatch(/permission/);
    expect(motions.createMotion).not.toHaveBeenCalled();
  });
});
