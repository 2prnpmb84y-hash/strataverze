import { db } from "@/prisma/db";
import type { Numeric, TimestampString } from "@prisma/orm-postgres/target/codec-types";

/** Cast a number or string to the Prisma 8 Numeric branded type. */
function toNumeric(value: number | string): Numeric<12, 2> {
  return String(value) as unknown as Numeric<12, 2>;
}

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

/**
 * Fetch all work orders for a scheme, newest first.
 */
export async function getWorkOrdersForScheme(schemeId: string) {
  return db.orm.public.WorkOrder
    .where((wo) => wo.schemeId.eq(schemeId))
    .include("raisedBy")
    .include("comments")
    .orderBy((wo) => wo.createdAt.desc())
    .all();
}

/**
 * Fetch a single work order by ID with comments and author details.
 */
export async function getWorkOrderById(workOrderId: string) {
  return db.orm.public.WorkOrder
    .include("raisedBy")
    .include("comments", (c) =>
      c.include("author").orderBy((cm) => cm.createdAt.asc()),
    )
    .first({ id: workOrderId });
}

/**
 * Create a new work order.
 */
export async function createWorkOrder(data: {
  schemeId: string;
  raisedById: string;
  title: string;
  description: string;
  priority?: string;
  category?: string;
  estimatedCost?: number;
  assignedTo?: string;
}) {
  return db.orm.public.WorkOrder.create({
    schemeId: data.schemeId,
    raisedById: data.raisedById,
    title: data.title,
    description: data.description,
    priority: data.priority ?? "MEDIUM",
    category: data.category ?? null,
    estimatedCost: data.estimatedCost != null ? toNumeric(data.estimatedCost) : null,
    assignedTo: data.assignedTo ?? null,
  });
}

/**
 * Update a work order's details.
 */
export async function updateWorkOrder(
  workOrderId: string,
  data: {
    title?: string;
    description?: string;
    priority?: string;
    status?: string;
    category?: string | null;
    estimatedCost?: number | null;
    actualCost?: number | null;
    assignedTo?: string | null;
    completedAt?: string | null;
  },
) {
  const update: Record<string, unknown> = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.description !== undefined) update.description = data.description;
  if (data.priority !== undefined) update.priority = data.priority;
  if (data.status !== undefined) update.status = data.status;
  if (data.category !== undefined) update.category = data.category;
  if (data.estimatedCost !== undefined)
    update.estimatedCost = data.estimatedCost != null ? toNumeric(data.estimatedCost) : null;
  if (data.actualCost !== undefined)
    update.actualCost = data.actualCost != null ? toNumeric(data.actualCost) : null;
  if (data.assignedTo !== undefined) update.assignedTo = data.assignedTo;
  if (data.completedAt !== undefined)
    update.completedAt = data.completedAt != null ? toTimestamp(data.completedAt) : null;

  return db.orm.public.WorkOrder
    .where({ id: workOrderId })
    .update(update);
}

/**
 * Delete a work order.
 */
export async function deleteWorkOrder(workOrderId: string) {
  return db.orm.public.WorkOrder
    .where({ id: workOrderId })
    .delete();
}

/**
 * Add a comment to a work order.
 */
export async function addComment(data: {
  workOrderId: string;
  authorId: string;
  content: string;
}) {
  return db.orm.public.Comment.create({
    workOrderId: data.workOrderId,
    authorId: data.authorId,
    content: data.content,
  });
}

/**
 * Fetch all comments for a work order with author profiles, ordered by createdAt ascending.
 */
export async function getCommentsForWorkOrder(workOrderId: string) {
  return db.orm.public.Comment
    .where((c) => c.workOrderId.eq(workOrderId))
    .include("author")
    .orderBy((c) => c.createdAt.asc())
    .all();
}

/**
 * Delete a comment.
 */
export async function deleteComment(commentId: string) {
  return db.orm.public.Comment
    .where({ id: commentId })
    .delete();
}

/**
 * Fetch work orders across multiple schemes (for owner/committee views).
 */
export async function getWorkOrdersForSchemes(schemeIds: string[]) {
  if (schemeIds.length === 0) return [];
  return db.orm.public.WorkOrder
    .where((wo) => wo.schemeId.in(schemeIds))
    .include("raisedBy")
    .include("comments")
    .orderBy((wo) => wo.createdAt.desc())
    .all();
}
