import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";

/**
 * Create a motion linked to a meeting.
 */
export async function createMotion(data: {
  schemeId: string;
  meetingId: string;
  raisedById: string;
  title: string;
  description: string;
  motionType: string;
}) {
  return db.orm.public.Motion.create({
    schemeId: data.schemeId,
    meetingId: data.meetingId,
    raisedById: data.raisedById,
    title: data.title,
    description: data.description,
    motionType: data.motionType,
    status: "DRAFT",
  });
}

/** Motion status vocabulary used by the adviser and owner portals. */
export const MOTION_STATUSES = ["DRAFT", "OPEN", "CARRIED", "DEFEATED", "PASSED", "WITHDRAWN"] as const;

/** Vote values accepted on motions (schema: FOR, AGAINST, ABSTAIN). */
export const VOTE_VALUES = ["FOR", "AGAINST", "ABSTAIN"] as const;

/**
 * Update a motion. Scheme-scoped: a motion from another scheme matches nothing.
 */
export async function updateMotion(
  schemeId: string,
  motionId: string,
  data: Partial<{
    title: string;
    description: string;
    motionType: string;
    status: string;
    outcome: string | null;
  }>,
) {
  return db.orm.public.Motion
    .where((m) => and(m.id.eq(motionId), m.schemeId.eq(schemeId)))
    .update(data);
}

/**
 * Delete a motion. Scheme-scoped: a motion from another scheme matches nothing.
 */
export async function deleteMotion(schemeId: string, motionId: string) {
  return db.orm.public.Motion
    .where((m) => and(m.id.eq(motionId), m.schemeId.eq(schemeId)))
    .delete();
}

/**
 * Cast a vote on a motion.
 */
export async function castVote(data: {
  motionId: string;
  profileId: string;
  voteValue: string;
}) {
  return db.orm.public.Vote.create({
    motionId: data.motionId,
    profileId: data.profileId,
    voteValue: data.voteValue,
  });
}

/**
 * Get a single motion with votes.
 */
export async function getMotionById(motionId: string) {
  return db.orm.public.Motion
    .include("raisedBy")
    .include("votes", (v) => v.include("profile"))
    .first({ id: motionId });
}
