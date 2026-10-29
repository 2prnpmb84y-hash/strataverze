"use server";

import { revalidatePath } from "next/cache";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { inScheme } from "@/lib/auth/scheme-scope";
import { getMeetingById } from "@/lib/queries/meetings";
import { getSchemeById } from "@/lib/queries/schemes";
import {
  createAgendaItem,
  getNextAgendaPosition,
  deleteAgendaItem,
  getAgendaItemsForMeeting,
  getAgendaItem,
} from "@/lib/queries/agenda";
import { validateAgendaItem } from "@/lib/meetings/agenda";
import {
  resolveAgendaTemplate,
  getMotionLibrary,
  resolveMotion,
} from "@/lib/meetings/templates";
import { normaliseMeetingType } from "@/lib/meetings/setup";
import { recordMeetingEvent } from "@/lib/meetings/events";
import type { MeetingType } from "@/lib/meetings/rules";
import { getActiveRuleSet, getActiveRuleSetForScheme } from "@/lib/meetings/rule-set-repo";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { bodyCorporateName } from "@/lib/jurisdiction/wording";
import { DECIDED_LATER_ITEM_REFUSAL, PENDING_ITEM_REFUSAL, isPendingItem } from "@/lib/meetings/pending";

export type AgendaFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function revalidate(schemeId: string, meetingId: string) {
  revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
}

export async function addAgendaItemAction(
  schemeId: string,
  meetingId: string,
  _prev: AgendaFormState,
  formData: FormData,
): Promise<AgendaFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");

    const meeting = await getMeetingById(meetingId);
    if (!meeting || !inScheme(meeting, schemeId)) return { error: "Meeting not found." };

    const input = {
      title: ((formData.get("title") as string) ?? "").trim(),
      resolutionText:
        ((formData.get("resolutionText") as string) ?? "").trim() || null,
      explanatoryNote:
        ((formData.get("explanatoryNote") as string) ?? "").trim() || null,
      resolutionCategory:
        ((formData.get("resolutionCategory") as string) ?? "").trim() || null,
    };

    // The categories are the building's (its rule set's).
    const ruleSet = await getActiveRuleSetForScheme(schemeId);
    const fieldErrors = validateAgendaItem(input, meeting.meetingType, ruleSet);
    if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

    const position = await getNextAgendaPosition(meetingId);
    await createAgendaItem({ meetingId, position, ...input });

    await recordMeetingEvent({
      meetingId,
      actorId: profile.id,
      eventType: "AGENDA_ITEM_ADDED",
      payload: { title: input.title, position },
    });

    revalidate(schemeId, meetingId);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to add agenda item. Please try again." };
  }
}

export async function loadAgendaTemplateAction(
  schemeId: string,
  meetingId: string,
): Promise<AgendaFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");

    const [meeting, scheme, existing] = await Promise.all([
      getMeetingById(meetingId),
      getSchemeById(schemeId),
      getAgendaItemsForMeeting(meetingId),
    ]);
    if (!meeting || !scheme || !inScheme(meeting, schemeId))
      return { error: "Meeting not found." };
    if (existing.length > 0)
      return { error: "This meeting already has agenda items." };

    const type = normaliseMeetingType(meeting.meetingType) as MeetingType | null;
    if (!type) return { error: "Unsupported meeting type." };

    const items = resolveAgendaTemplate(scheme.state, type, {
      planNumber: scheme.planNumber,
      bodyCorporate: bodyCorporateName(rulesForState(scheme.state).rules.TERMINOLOGY, scheme),
    });
    if (items.length === 0)
      return { error: "No template is defined for this meeting type." };

    for (const item of items) {
      await createAgendaItem({
        meetingId,
        position: item.position,
        title: item.title,
        resolutionText: item.resolutionText,
        explanatoryNote: item.explanatoryNote ?? null,
        resolutionCategory: item.resolutionCategory,
      });
    }

    await recordMeetingEvent({
      meetingId,
      actorId: profile.id,
      eventType: "AGENDA_TEMPLATE_LOADED",
      payload: { count: items.length, meetingType: meeting.meetingType },
    });

    revalidate(schemeId, meetingId);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to load the agenda template." };
  }
}

export async function addMotionFromLibraryAction(
  schemeId: string,
  meetingId: string,
  motionKey: string,
): Promise<AgendaFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");

    const [meeting, scheme] = await Promise.all([
      getMeetingById(meetingId),
      getSchemeById(schemeId),
    ]);
    if (!meeting || !scheme || !inScheme(meeting, schemeId))
      return { error: "Meeting not found." };

    const type = normaliseMeetingType(meeting.meetingType) as MeetingType | null;
    const entry = getMotionLibrary(scheme.state, type ?? undefined).find(
      (m) => m.key === motionKey,
    );
    if (!entry) return { error: "Motion not found in the library." };

    const resolved = resolveMotion(entry, {
      planNumber: scheme.planNumber,
      bodyCorporate: bodyCorporateName(rulesForState(scheme.state).rules.TERMINOLOGY, scheme),
    });

    const fieldErrors = validateAgendaItem(
      { title: resolved.title, resolutionCategory: resolved.resolutionCategory },
      meeting.meetingType,
      await getActiveRuleSet(scheme.state),
    );
    if (Object.keys(fieldErrors).length > 0) {
      return {
        error:
          "This motion cannot be added to this meeting type (resolution category not permitted).",
      };
    }

    const position = await getNextAgendaPosition(meetingId);
    await createAgendaItem({
      meetingId,
      position,
      title: resolved.title,
      resolutionText: resolved.resolutionText,
      explanatoryNote: resolved.explanatoryNote ?? null,
      resolutionCategory: resolved.resolutionCategory,
    });

    await recordMeetingEvent({
      meetingId,
      actorId: profile.id,
      eventType: "AGENDA_ITEM_ADDED",
      payload: { fromLibrary: motionKey, position },
    });

    revalidate(schemeId, meetingId);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to add the motion." };
  }
}

/**
 * D10 (review M2): why the database refused to delete an agenda item a
 * pending resolution relies on (its own resolution, decided later or not, or
 * the motion that confirmed one), or null for any other error.
 */
function pendingReferenceRefusal(err: unknown): string | null {
  const text =
    err instanceof Error
      ? `${err.message} ${JSON.stringify((err as { cause?: unknown }).cause ?? "")} ${JSON.stringify(err)} ${String((err as { code?: unknown }).code ?? "")}`
      : String(err);
  if (!/pending_resolutions/.test(text) || !/23503|foreign key/i.test(text)) return null;
  if (/pending_resolutions_confirmed_item_id_fkey/.test(text)) {
    return "This motion is recorded as deciding a resolution of another meeting, so it cannot be removed. Nothing was saved.";
  }
  return DECIDED_LATER_ITEM_REFUSAL;
}

export async function deleteAgendaItemAction(
  schemeId: string,
  meetingId: string,
  itemId: string,
): Promise<AgendaFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");

    const meeting = await getMeetingById(meetingId);
    if (!meeting || !inScheme(meeting, schemeId)) return { error: "Meeting not found." };

    const item = await getAgendaItem(meetingId, itemId);
    if (!item) return { error: "Agenda item not found." };
    // An item decided later (INTERIM, only ever under a draft pack) cannot be removed (decision D10).
    if (isPendingItem(item)) return { error: PENDING_ITEM_REFUSAL };

    try {
      await deleteAgendaItem(meetingId, itemId);
    } catch (err) {
      // An item a resolution decided later relies on (review M2): the database refuses the delete (the pending
      // row's keys to the item, NO ACTION), so nothing is removed. Read from the refusal, so NSW and Queensland,
      // which never have such a row, read nothing more.
      const refusal = pendingReferenceRefusal(err);
      if (refusal) return { error: refusal };
      throw err;
    }
    await recordMeetingEvent({
      meetingId,
      actorId: profile.id,
      eventType: "AGENDA_ITEM_REMOVED",
      payload: { itemId },
    });

    revalidate(schemeId, meetingId);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to remove the agenda item." };
  }
}
