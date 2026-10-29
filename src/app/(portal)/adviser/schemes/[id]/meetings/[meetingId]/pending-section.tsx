"use client";

/**
 * The meeting page's "Decided later" panel (VIC, ACT and WA stage 2, PR 8b-i,
 * 29 Oct 2026): each resolution of the meeting decided or taking effect
 * later, where it stands, and what an adviser records about it while it is
 * pending: from PR 8b-ii also Western Australia's written votes after the
 * meeting and its outcome notice. Every word and day comes from the server
 * (pendingPanelData); this file takes no pack value.
 */
import { useId, useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  recordLateVoteAction,
  recordPendingConfirmationAction,
  recordPendingNoticeAction,
  recordPendingPetitionAction,
  recordSpecialMeetingNoticeAction,
  type PendingActionState,
} from "./pending-actions";

/** One resolution as the server gives it (PendingPanelEntry). */
export interface PendingItemProps {
  id: string;
  itemId: string;
  itemLabel: string;
  kindLabel: string;
  help: string;
  status: "PENDING" | "CARRIED" | "LOST";
  standing: string;
  facts: string[];
  blocker: string | null;
  canRecordNotice: boolean;
  petitionWords: string | null;
  meetingNoticeWords: string | null;
  canConfirm: boolean;
  madeOn: string;
  windowClosesOn: string;
  today: string;
  confirmChoices: { meetingId: string; label: string; items: { id: string; label: string }[] }[];
  /** The question for the notice's day, where it is not the usual one (Western Australia's outcome notice, PR 8b-ii). */
  noticeLabel?: string;
  /** Western Australia's written votes after the meeting (PR 8b-ii): who may vote and until when, and the lots that may. */
  lateVote?: { words: string; lots: { id: string; lotNumber: string }[] };
}

const STATUS: Record<PendingItemProps["status"], { label: string; style: string }> = {
  PENDING: { label: "Pending", style: "bg-amber-100 text-amber-800" },
  CARRIED: { label: "Took effect", style: "bg-green-100 text-green-700" },
  LOST: { label: "Lost", style: "bg-red-100 text-red-700" },
};

export function PendingSection({
  schemeId,
  meetingId,
  items,
  lots,
  specialMeetings,
}: {
  schemeId: string;
  meetingId: string;
  items: PendingItemProps[];
  lots: { id: string; lotNumber: string }[];
  specialMeetings: { id: string; label: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <Card className="mb-6">
      <CardHeader
        title="Decided later"
        description="Resolutions of this meeting that are decided or take effect after it. Record what happens to each here."
      />
      <ol className="space-y-3">
        {items.map((item) => (
          <PendingItem key={item.id} schemeId={schemeId} meetingId={meetingId} item={item} lots={lots} specialMeetings={specialMeetings} />
        ))}
      </ol>
    </Card>
  );
}

function PendingItem({
  schemeId,
  meetingId,
  item,
  lots,
  specialMeetings,
}: {
  schemeId: string;
  meetingId: string;
  item: PendingItemProps;
  lots: { id: string; lotNumber: string }[];
  specialMeetings: { id: string; label: string }[];
}) {
  const id = useId();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeDay, setNoticeDay] = useState("");
  const [petitionDay, setPetitionDay] = useState("");
  const [signed, setSigned] = useState<Record<string, boolean>>({});
  const [callDay, setCallDay] = useState("");
  const [called, setCalled] = useState("");
  const [confirmMeeting, setConfirmMeeting] = useState(item.confirmChoices[0]?.meetingId ?? "");
  const [confirmItem, setConfirmItem] = useState("");
  const [lateDay, setLateDay] = useState("");
  const [lateLot, setLateLot] = useState("");
  const [lateVote, setLateVote] = useState("");

  function run(fn: () => Promise<PendingActionState>) {
    setError(null);
    setNotice(null);
    start(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
      if (result?.notice) setNotice(result.notice);
    });
  }

  const status = STATUS[item.status];
  const choice = item.confirmChoices.find((c) => c.meetingId === confirmMeeting);
  const signedIds = Object.entries(signed)
    .filter(([, on]) => on)
    .map(([lotId]) => lotId);

  return (
    <li className="rounded-[var(--radius-card)] border border-line p-3 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm text-ink">{item.itemLabel}</span>
        <span className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-paper-2 text-ink-muted">{item.kindLabel}</span>
          <span className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${status.style}`}>{status.label}</span>
        </span>
      </div>
      <p className="text-sm text-ink">{item.standing}</p>
      <ul className="text-xs text-ink-muted space-y-0.5">
        {item.facts.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {item.blocker && (
        <p role="status" className="rounded-[var(--radius-card)] bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          {item.blocker}
        </p>
      )}
      <details className="text-xs text-ink-muted">
        <summary className="cursor-pointer">How this is decided</summary>
        <p className="mt-1">{item.help}</p>
      </details>

      {error && (
        <p role="alert" className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {notice && <p className="rounded-[var(--radius-card)] bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">{notice}</p>}

      {item.canRecordNotice && (
        <div className="flex items-end gap-2 flex-wrap">
          <label htmlFor={`${id}-notice`} className="text-xs text-ink">
            {item.noticeLabel ?? "Day the owners were given notice of it"}
            <input
              id={`${id}-notice`}
              type="date"
              min={item.madeOn}
              max={item.today}
              value={noticeDay}
              disabled={pending}
              onChange={(e) => setNoticeDay(e.target.value)}
              className="mt-1 block rounded border border-line bg-white px-2 py-1 text-xs"
            />
          </label>
          <Button type="button" variant="secondary" disabled={pending || !noticeDay} onClick={() => run(() => recordPendingNoticeAction(schemeId, meetingId, item.id, noticeDay))}>
            Record the notice
          </Button>
        </div>
      )}

      {item.lateVote && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-ink">Written vote</legend>
          <p className="text-xs text-ink-muted">{item.lateVote.words}</p>
          <div className="flex items-end gap-2 flex-wrap">
            <label htmlFor={`${id}-late-day`} className="text-xs text-ink">
              Day it was received
              <input
                id={`${id}-late-day`}
                type="date"
                min={item.madeOn}
                max={item.windowClosesOn < item.today ? item.windowClosesOn : item.today}
                value={lateDay}
                disabled={pending}
                onChange={(e) => setLateDay(e.target.value)}
                className="mt-1 block rounded border border-line bg-white px-2 py-1 text-xs"
              />
            </label>
            <label htmlFor={`${id}-late-lot`} className="text-xs text-ink">
              Lot
              <select id={`${id}-late-lot`} value={lateLot} disabled={pending} onChange={(e) => setLateLot(e.target.value)} className="mt-1 block rounded border border-line bg-white px-2 py-1 text-xs">
                <option value="">Choose the lot</option>
                {item.lateVote.lots.map((l) => (
                  <option key={l.id} value={l.id}>
                    Lot {l.lotNumber}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={`${id}-late-vote`} className="text-xs text-ink">
              Vote
              <select id={`${id}-late-vote`} value={lateVote} disabled={pending} onChange={(e) => setLateVote(e.target.value)} className="mt-1 block rounded border border-line bg-white px-2 py-1 text-xs">
                <option value="">Choose the vote</option>
                <option value="FOR">For</option>
                <option value="AGAINST">Against</option>
              </select>
            </label>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || !lateDay || !lateLot || !lateVote}
              onClick={() => run(() => recordLateVoteAction(schemeId, meetingId, item.id, lateLot, lateVote, lateDay))}
            >
              Record the written vote
            </Button>
          </div>
        </fieldset>
      )}

      {item.petitionWords && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-ink">Petition</legend>
          <p className="text-xs text-ink-muted">{item.petitionWords} stops it. Record it only if it was received by the last day of its period.</p>
          <label htmlFor={`${id}-petition`} className="block text-xs text-ink">
            Day it was received
            <input
              id={`${id}-petition`}
              type="date"
              min={item.madeOn}
              max={item.windowClosesOn < item.today ? item.windowClosesOn : item.today}
              value={petitionDay}
              disabled={pending}
              onChange={(e) => setPetitionDay(e.target.value)}
              className="mt-1 block rounded border border-line bg-white px-2 py-1 text-xs"
            />
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 text-xs text-ink" role="group" aria-label="Lots that signed the petition">
            {lots.map((l) => (
              <label key={l.id} className="flex items-center gap-1">
                <input type="checkbox" checked={signed[l.id] === true} disabled={pending} onChange={(e) => setSigned((all) => ({ ...all, [l.id]: e.target.checked }))} />
                Lot {l.lotNumber}
              </label>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={pending || !petitionDay || signedIds.length === 0}
            onClick={() => run(() => recordPendingPetitionAction(schemeId, meetingId, item.id, petitionDay, signedIds))}
          >
            Record the petition ({signedIds.length} {signedIds.length === 1 ? "lot" : "lots"})
          </Button>
        </fieldset>
      )}

      {item.meetingNoticeWords && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-ink">Special general meeting</legend>
          <p className="text-xs text-ink-muted">{item.meetingNoticeWords} stops it taking effect until that meeting decides it.</p>
          <div className="flex items-end gap-2 flex-wrap">
            <label htmlFor={`${id}-call`} className="text-xs text-ink">
              Day the notice was given
              <input
                id={`${id}-call`}
                type="date"
                min={item.madeOn}
                max={item.windowClosesOn < item.today ? item.windowClosesOn : item.today}
                value={callDay}
                disabled={pending}
                onChange={(e) => setCallDay(e.target.value)}
                className="mt-1 block rounded border border-line bg-white px-2 py-1 text-xs"
              />
            </label>
            <label htmlFor={`${id}-called`} className="text-xs text-ink">
              The meeting it called
              <select id={`${id}-called`} value={called} disabled={pending} onChange={(e) => setCalled(e.target.value)} className="mt-1 block rounded border border-line bg-white px-2 py-1 text-xs">
                <option value="">Choose the meeting</option>
                {specialMeetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || !callDay || !called}
              onClick={() => run(() => recordSpecialMeetingNoticeAction(schemeId, meetingId, item.id, callDay, called))}
            >
              Record the meeting notice
            </Button>
          </div>
          {specialMeetings.length === 0 && <p className="text-xs text-ink-muted">Create the special general meeting first, then record its notice here.</p>}
        </fieldset>
      )}

      {item.canConfirm && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-ink">Decision of a later meeting</legend>
          {item.confirmChoices.length === 0 ? (
            <p className="text-xs text-ink-muted">No later meeting has a motion recorded that can decide it yet.</p>
          ) : (
            <div className="flex items-end gap-2 flex-wrap">
              <label htmlFor={`${id}-confirm-meeting`} className="text-xs text-ink">
                Meeting
                <select
                  id={`${id}-confirm-meeting`}
                  value={confirmMeeting}
                  disabled={pending}
                  onChange={(e) => {
                    setConfirmMeeting(e.target.value);
                    setConfirmItem("");
                  }}
                  className="mt-1 block rounded border border-line bg-white px-2 py-1 text-xs"
                >
                  {item.confirmChoices.map((c) => (
                    <option key={c.meetingId} value={c.meetingId}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor={`${id}-confirm-item`} className="text-xs text-ink">
                Motion
                <select id={`${id}-confirm-item`} value={confirmItem} disabled={pending} onChange={(e) => setConfirmItem(e.target.value)} className="mt-1 block rounded border border-line bg-white px-2 py-1 text-xs">
                  <option value="">Choose the motion</option>
                  {(choice?.items ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                variant="secondary"
                disabled={pending || !confirmMeeting || !confirmItem}
                onClick={() => run(() => recordPendingConfirmationAction(schemeId, meetingId, item.id, confirmMeeting, confirmItem))}
              >
                Record the decision
              </Button>
            </div>
          )}
        </fieldset>
      )}
    </li>
  );
}
