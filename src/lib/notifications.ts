import { sendEmail } from "@/lib/email";
import { invitationEmail } from "@/lib/email-templates/invitation";
import {
  workOrderCreatedEmail,
  workOrderStatusEmail,
} from "@/lib/email-templates/work-order";
import { levyIssuedEmail } from "@/lib/email-templates/levy";
import { meetingScheduledEmail } from "@/lib/email-templates/meeting";
import { announcementPublishedEmail } from "@/lib/email-templates/announcement";
import { platformInvoiceEmail } from "@/lib/email-templates/platform-invoice";

const APP_URL = process.env.APP_URL ?? "https://strataverze.com.au";

// ─── Invitations ────────────────────────────────────────────────

export async function notifyInvitation(params: {
  recipientEmail: string;
  schemeName: string;
  role: string;
  inviterName: string;
  expiresAt: Date;
  invitationToken: string;
}) {
  const email = invitationEmail({
    recipientEmail: params.recipientEmail,
    schemeName: params.schemeName,
    role: params.role,
    inviterName: params.inviterName,
    expiresAt: params.expiresAt,
    acceptUrl: `${APP_URL}/invitations`,
  });
  await sendEmail(email);
}

// ─── Work Orders ────────────────────────────────────────────────

export async function notifyWorkOrderCreated(params: {
  recipientEmails: string[];
  workOrderId: string;
  workOrderTitle: string;
  schemeName: string;
  raisedByName: string;
  priority: string;
  portalPath: string;
}) {
  const email = workOrderCreatedEmail({
    recipientEmails: params.recipientEmails,
    workOrderTitle: params.workOrderTitle,
    schemeName: params.schemeName,
    raisedByName: params.raisedByName,
    priority: params.priority,
    detailUrl: `${APP_URL}${params.portalPath}/${params.workOrderId}`,
  });
  await sendEmail(email);
}

export async function notifyWorkOrderStatusChange(params: {
  recipientEmail: string;
  workOrderId: string;
  workOrderTitle: string;
  schemeName: string;
  status: string;
  updatedByName: string;
  portalPath: string;
}) {
  const email = workOrderStatusEmail({
    recipientEmail: params.recipientEmail,
    workOrderTitle: params.workOrderTitle,
    schemeName: params.schemeName,
    status: params.status,
    updatedByName: params.updatedByName,
    detailUrl: `${APP_URL}${params.portalPath}/${params.workOrderId}`,
  });
  await sendEmail(email);
}

// ─── Levies ─────────────────────────────────────────────────────

export async function notifyLevyIssued(params: {
  recipientEmail: string;
  ownerName: string;
  schemeName: string;
  levyTitle: string;
  amount: string;
  dueDate: Date;
  levyId: string;
}) {
  const email = levyIssuedEmail({
    recipientEmail: params.recipientEmail,
    ownerName: params.ownerName,
    schemeName: params.schemeName,
    levyTitle: params.levyTitle,
    amount: params.amount,
    dueDate: params.dueDate,
    detailUrl: `${APP_URL}/owner/levies`,
  });
  await sendEmail(email);
}

// ─── Meetings ───────────────────────────────────────────────────

export async function notifyMeetingScheduled(params: {
  recipientEmails: string[];
  schemeName: string;
  meetingTitle: string;
  meetingType: string;
  scheduledAt: Date;
  location?: string;
  meetingId: string;
}) {
  const email = meetingScheduledEmail({
    recipientEmails: params.recipientEmails,
    schemeName: params.schemeName,
    meetingTitle: params.meetingTitle,
    meetingType: params.meetingType,
    scheduledAt: params.scheduledAt,
    location: params.location,
    detailUrl: `${APP_URL}/committee/governance/${params.meetingId}`,
  });
  await sendEmail(email);
}

// ─── Announcements ─────────────────────────────────────────────

export async function notifyAnnouncementPublished(params: {
  recipientEmails: string[];
  schemeName: string;
  title: string;
  body: string;
  priority: string;
  authorName: string;
  portalPath: string;
  announcementId: string;
}) {
  const email = announcementPublishedEmail({
    recipientEmails: params.recipientEmails,
    schemeName: params.schemeName,
    title: params.title,
    body: params.body,
    priority: params.priority,
    authorName: params.authorName,
    detailUrl: `${APP_URL}${params.portalPath}/${params.announcementId}`,
  });
  await sendEmail(email);
}

// ─── StrataVerze invoices ───────────────────────────────────────

export async function notifyPlatformInvoiceIssued(params: {
  recipientEmails: string[];
  schemeName: string;
  invoiceNumber: string;
  monthLabel: string;
  total: string;
  promotional: boolean;
  needsApproval: boolean;
}) {
  if (params.recipientEmails.length === 0) return;
  await sendEmail(
    platformInvoiceEmail({
      to: params.recipientEmails,
      schemeName: params.schemeName,
      invoiceNumber: params.invoiceNumber,
      monthLabel: params.monthLabel,
      total: params.total,
      promotional: params.promotional,
      needsApproval: params.needsApproval,
      detailUrl: `${APP_URL}/owner/finance/platform-fees`,
    }),
  );
}
