"use client";

import { useActionState, useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField, TextareaField, SelectField } from "@/components/ui/form-field";
import { bodyCorporateName, type Terms } from "@/lib/jurisdiction/wording";
import {
  addAgendaItemAction,
  loadAgendaTemplateAction,
  addMotionFromLibraryAction,
  deleteAgendaItemAction,
  type AgendaFormState,
} from "./agenda-actions";

const CATEGORY_LABELS: Record<string, string> = {
  ORDINARY: "Ordinary",
  SPECIAL: "Special",
  UNANIMOUS: "Unanimous",
  SUSTAINABILITY_INFRASTRUCTURE: "Sustainability infrastructure",
};

const CATEGORY_STYLE: Record<string, string> = {
  ORDINARY: "bg-turquoise/10 text-turquoise-700",
  SPECIAL: "bg-amber-100 text-amber-800",
  UNANIMOUS: "bg-purple-100 text-purple-700",
  SUSTAINABILITY_INFRASTRUCTURE: "bg-green-100 text-green-700",
};

export interface AgendaItemView {
  id: string;
  position: number;
  title: string;
  resolutionText: string | null;
  explanatoryNote: string | null;
  resolutionCategory: string | null;
}

export interface MotionLibraryView {
  key: string;
  title: string;
  defaultResolutionCategory: string;
}

export function AgendaSection({
  schemeId,
  meetingId,
  items,
  motionLibrary,
  allowedCategories,
  canLoadTemplate,
  editable,
  terms,
}: {
  schemeId: string;
  meetingId: string;
  items: AgendaItemView[];
  motionLibrary: MotionLibraryView[];
  allowedCategories: string[];
  canLoadTemplate: boolean;
  editable: boolean;
  /** The building's words for its owners corporation (`rules.TERMINOLOGY`), for the example resolution. */
  terms: Pick<Terms, "bodyCorporateName" | "ownersCorporation">;
}) {
  const [state, formAction, isPending] = useActionState<
    AgendaFormState,
    FormData
  >(addAgendaItemAction.bind(null, schemeId, meetingId), {});

  const [pending, start] = useTransition();
  const [motionKey, setMotionKey] = useState(motionLibrary[0]?.key ?? "");
  const [actionError, setActionError] = useState<string | null>(null);

  function run(fn: () => Promise<AgendaFormState>) {
    setActionError(null);
    start(async () => {
      const result = await fn();
      if (result?.error) setActionError(result.error);
    });
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title="Agenda"
        description="Structured agenda items for this meeting's notice and minutes."
      />

      {actionError && (
        <div className="mb-4 rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-ink-muted mb-4">
          No agenda items yet.
          {canLoadTemplate
            ? " Load the standard agenda for this meeting type, or add items below."
            : " Add items below or from the motion library."}
        </p>
      ) : (
        <ol className="space-y-3 mb-5">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-[var(--radius-card)] border border-line p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="font-heading font-semibold text-ink-muted">
                    {item.position}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-heading font-semibold text-ink uppercase text-sm">
                        {item.title}
                      </h3>
                      {item.resolutionCategory && (
                        <span
                          className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${CATEGORY_STYLE[item.resolutionCategory] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {CATEGORY_LABELS[item.resolutionCategory] ??
                            item.resolutionCategory}
                        </span>
                      )}
                    </div>
                    {item.resolutionText && (
                      <p className="mt-1.5 text-sm text-ink">
                        {item.resolutionText}
                      </p>
                    )}
                    {item.explanatoryNote && (
                      <p className="mt-1.5 text-xs italic text-ink-muted">
                        {item.explanatoryNote}
                      </p>
                    )}
                  </div>
                </div>
                {editable && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        deleteAgendaItemAction(schemeId, meetingId, item.id),
                      )
                    }
                    className="text-xs text-red-600 hover:text-red-700 shrink-0"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {editable && (
        <>
          <div className="flex flex-wrap gap-3 mb-5">
            {canLoadTemplate && items.length === 0 && (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  run(() => loadAgendaTemplateAction(schemeId, meetingId))
                }
              >
                Load standard agenda
              </Button>
            )}
            {motionLibrary.length > 0 && (
              <div className="flex items-end gap-2">
                <SelectField
                  label="Motion library"
                  name="motionKey"
                  value={motionKey}
                  onChange={(e) => setMotionKey(e.target.value)}
                  options={motionLibrary.map((m) => ({
                    value: m.key,
                    label: m.title,
                  }))}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending || !motionKey}
                  onClick={() =>
                    run(() =>
                      addMotionFromLibraryAction(schemeId, meetingId, motionKey),
                    )
                  }
                >
                  Add
                </Button>
              </div>
            )}
          </div>

          <form action={formAction} className="space-y-3 border-t border-line pt-5">
            <h3 className="font-heading font-semibold text-ink text-sm">
              Add an agenda item
            </h3>
            {state.error && (
              <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {state.error}
              </div>
            )}
            <FormField
              label="Title"
              name="title"
              required
              placeholder="e.g. Appointment of Strata Manager"
              error={state.fieldErrors?.title}
            />
            <SelectField
              label="Resolution category"
              name="resolutionCategory"
              options={allowedCategories.map((c) => ({
                value: c,
                label: CATEGORY_LABELS[c] ?? c,
              }))}
              error={state.fieldErrors?.resolutionCategory}
            />
            <TextareaField
              label="Proposed resolution"
              name="resolutionText"
              rows={2}
              placeholder={`${bodyCorporateName(terms, { name: "...", planNumber: "..." })} RESOLVES ...`}
            />
            <TextareaField
              label="Explanatory note (optional)"
              name="explanatoryNote"
              rows={2}
            />
            <Button type="submit" disabled={isPending}>
              {isPending ? "Adding..." : "Add agenda item"}
            </Button>
          </form>
        </>
      )}
    </Card>
  );
}
