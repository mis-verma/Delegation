import { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router';
import { AlertTriangle, ArrowRight, Clock3 } from 'lucide-react';
import { Button } from '../../../components';
import { useAuth } from '../../../context/AuthContext';
import { useChecklistInstanceSummaryQuery, useMyChecklistInstancesQuery } from '../hook';
import { todayPeriodBoundIso } from '../checklistDisplay';

// Keyed by the org-local calendar day (the same day the checklists themselves are generated for),
// not the UTC date: a device in another time zone would otherwise reset the "seen today" flag at the
// wrong hour, or hold it past the org's midnight.
const ackStorageKey = (userId: string) => `checklist-overdue-ack:${userId}:${todayPeriodBoundIso().slice(0, 10)}`;

// localStorage can throw (private window, blocked site data); a failed read just means "not
// acknowledged yet", a failed write means the prompt may show again, neither should break the app.
const readAck = (userId: string) => {
  try { return localStorage.getItem(ackStorageKey(userId)) === '1'; } catch { return false; }
};
const writeAck = (userId: string) => {
  try { localStorage.setItem(ackStorageKey(userId), '1'); } catch { /* ignore */ }
};

const PREVIEW_LIMIT = 3;

const OVERDUE_FILTER = { status: 'OVERDUE' } as const;
const PREVIEW_PAGING = { page: 1, limit: PREVIEW_LIMIT };

// The "hard to miss" step of the app's escalating overdue design (bell notification the moment a
// run goes overdue, a banner on My Checklists, and this) — a full-screen prompt for whoever is
// carrying an overdue checklist, shown once per calendar day per person (tracked in localStorage,
// keyed by user + date, so it resurfaces the next day rather than nagging on every navigation).
// It is deliberately NOT a true trap: "Remind me later" and Escape both dismiss it for the rest of
// today, and there's no click-outside-to-dismiss (an accidental stray click shouldn't quietly
// waive the one signal this whole feature exists to surface) — see checklistOverdueNotifier.job.ts
// on the server for the notification half of this same design.
export const OverdueChecklistInterstitial = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  // Bumped (not read) by acknowledge() below — reading localStorage happens directly in the render
  // body, since it's a synchronous read with no subscription to set up, so there's nothing for an
  // effect to do here; this just forces a re-render after acknowledge() writes the new value.
  const [, forceRecheck] = useState(0);

  const { data: summary } = useChecklistInstanceSummaryQuery({ mine: true });
  const overdueCount = summary?.overdue ?? 0;

  const acknowledgedToday = user ? readAck(user.id) : true;
  const open = overdueCount > 0 && !acknowledgedToday;

  // The preview list is only worth a request while the prompt is actually going to show. Once
  // today's acknowledged (or nothing is overdue) it never runs.
  const { data: overdueInstances = [] } = useMyChecklistInstancesQuery(OVERDUE_FILTER, PREVIEW_PAGING, { enabled: open });

  const acknowledge = () => {
    if (user) writeAck(user.id);
    forceRecheck((v) => v + 1);
  };

  const goFillIt = () => {
    acknowledge();
    navigate('/checklists?status=overdue');
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) acknowledge(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:duration-200 data-[state=closed]:duration-150" />
        <DialogPrimitive.Content
          onPointerDownOutside={(e) => e.preventDefault()}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=open]:duration-200 data-[state=closed]:duration-150"
        >
          <div className="relative w-full max-w-md flex flex-col items-center gap-5 overflow-hidden rounded-2xl border border-danger/25 bg-surface p-8 pt-9 sm:p-9 sm:pt-10 text-center">
            {/* Top accent: the one flourish that makes this read as a designed alert rather than a
                plain bordered box, without tinting the whole card danger-red. */}
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,transparent,var(--color-danger),transparent)]"
            />

            <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-danger text-white">
              <AlertTriangle size={28} strokeWidth={1.75} aria-hidden />
            </div>

            <div className="flex flex-col gap-1.5">
              <DialogPrimitive.Title className="text-xl font-display font-bold text-text tracking-tight">
                {overdueCount} checklist{overdueCount === 1 ? '' : 's'} overdue
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm font-display text-text-muted leading-relaxed max-w-xs mx-auto">
                {overdueCount === 1
                  ? "It's already past its cutoff and still not filled in."
                  : "They're already past their cutoff and still not filled in."}
              </DialogPrimitive.Description>
            </div>

            {overdueInstances.length > 0 && (
              <ul className="w-full flex flex-col gap-1.5 text-left">
                {overdueInstances.slice(0, PREVIEW_LIMIT).map((instance) => (
                  <li
                    key={instance.id}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-danger/[0.06] border border-danger/15 text-sm font-display font-semibold text-text"
                  >
                    <span className="flex items-center justify-center size-7 rounded-lg bg-danger/15 text-danger shrink-0">
                      <Clock3 size={14} strokeWidth={2.25} aria-hidden />
                    </span>
                    <span className="truncate">{instance.title}</span>
                  </li>
                ))}
                {overdueCount > PREVIEW_LIMIT && (
                  <li className="text-xs font-display font-medium text-text-muted px-3 pt-0.5">
                    + {overdueCount - PREVIEW_LIMIT} more
                  </li>
                )}
              </ul>
            )}

            <div className="flex flex-col sm:flex-row-reverse gap-2.5 w-full pt-1">
              <Button variant="danger" size="lg" className="flex-1" onClick={goFillIt}>
                Go fill it now
                <ArrowRight size={15} aria-hidden />
              </Button>
              <Button variant="outline" size="lg" className="flex-1" onClick={acknowledge}>
                Remind me later
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
