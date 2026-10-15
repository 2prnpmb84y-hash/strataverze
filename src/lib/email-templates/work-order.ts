import { emailLayout, emailButton } from "./layout";

type WorkOrderNotificationParams = {
  recipientEmail: string;
  workOrderTitle: string;
  schemeName: string;
  status: string;
  updatedByName: string;
  detailUrl: string;
};

const statusLabels: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function workOrderStatusEmail(params: WorkOrderNotificationParams) {
  const statusLabel = statusLabels[params.status] ?? params.status;

  const statusColour =
    params.status === "COMPLETED"
      ? "#22c55e"
      : params.status === "IN_PROGRESS"
        ? "#3b82f6"
        : params.status === "CANCELLED"
          ? "#ef4444"
          : "#f59e0b";

  const content = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a2e;">
      Work Order Updated
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:#1A202C;line-height:1.6;">
      The status of <strong>${params.workOrderTitle}</strong> in
      <strong>${params.schemeName}</strong> has been updated.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#64748B;width:100px;">Status</td>
        <td style="padding:4px 8px;">
          <span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;background-color:${statusColour}20;color:${statusColour};">
            ${statusLabel}
          </span>
        </td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#64748B;">Updated by</td>
        <td style="padding:4px 8px;font-size:13px;color:#1A202C;">${params.updatedByName}</td>
      </tr>
    </table>
    ${emailButton("View Work Order", params.detailUrl)}
  `;

  return {
    to: params.recipientEmail,
    subject: `Work order "${params.workOrderTitle}" is now ${statusLabel}`,
    html: emailLayout(content),
  };
}

type WorkOrderCreatedParams = {
  recipientEmails: string[];
  workOrderTitle: string;
  schemeName: string;
  raisedByName: string;
  priority: string;
  detailUrl: string;
};

export function workOrderCreatedEmail(params: WorkOrderCreatedParams) {
  const content = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a2e;">
      New Work Order
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:#1A202C;line-height:1.6;">
      A new work order has been raised for <strong>${params.schemeName}</strong>.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#64748B;width:100px;">Title</td>
        <td style="padding:4px 8px;font-size:13px;color:#1A202C;font-weight:600;">${params.workOrderTitle}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#64748B;">Raised by</td>
        <td style="padding:4px 8px;font-size:13px;color:#1A202C;">${params.raisedByName}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#64748B;">Priority</td>
        <td style="padding:4px 8px;font-size:13px;color:#1A202C;">${params.priority}</td>
      </tr>
    </table>
    ${emailButton("View Work Order", params.detailUrl)}
  `;

  return {
    to: params.recipientEmails,
    subject: `New work order: ${params.workOrderTitle}`,
    html: emailLayout(content),
  };
}
