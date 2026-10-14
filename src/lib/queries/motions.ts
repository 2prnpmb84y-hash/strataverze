import { db } from "@/prisma/db";

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

/**
 * Update a motion.
 */
export async function updateMotion(
  motionId: string,
  data: Partial<{
    title: string;
    description: string;
    motionType: string;
    status: string;
    outcome: string | null;
  }>,
) {
  return db.orm.public.Motion.where({ id: motionId }).update(data);
}

/**
 * Delete a motion.
 */
export async function deleteMotion(motionId: string) {
  return db.orm.public.Motion.where({ id: motionId }).delete();
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
