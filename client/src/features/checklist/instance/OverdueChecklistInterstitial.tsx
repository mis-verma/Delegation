import { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router';
import { AlertTriangle, ArrowRight, Clock3 } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useChecklistInstanceSummaryQuery, useMyChecklistInstancesQuery } from '../hook';

const todayKey = () => new Date().toISOString().slice(0, 10);
const ackStorageKey = (userId: string) => `checklist-overdue-ack:${userId}:${todayKey()}`;

const PREVIEW_LIMIT = 3;

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
  const { data: overdueInstances = [] } = useMyChecklistInstancesQuery(
    { status: 'OVERDUE' },
    { page: 1, limit: PREVIEW_LIMIT },
  );

  const acknowledgedToday = user ? localStorage.getItem(ackStorageKey(user.id)) === '1' : true;
  const open = overdueCount > 0 && !acknowledgedToday;

  const acknowledge = () => {
    if (user) localStorage.setItem(ackStorageKey(user.id), '1');
    forceRecheck((v) => v + 1);
  };

  const goFillIt = () => {
    acknowledge();
    navigate('/checklists?status=overdue');
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) acknowledge(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:duration-200 data-[state=closed]:duration-150" />
        <DialogPrimitive.Content
          onPointerDownOutside={(e) => e.preventDefault()}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=open]:duration-200 data-[state=closed]:duration-150"
        >
          <div className="relative w-full max-w-md flex flex-col items-center gap-5 overflow-hidden rounded-2xl border border-danger/25 bg-surface p-8 pt-9 sm:p-9 sm:pt-10 text-center shadow-2xl shadow-danger/10">
            {/* Top accent — the one flourish that makes this read as a designed alert rather than a
                plain bordered box, without tinting the whole card danger-red. */}
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,transparent,var(--color-danger),transparent)]"
            />
            <span aria-hidden="true" className="absolute -top-20 -right-14 size-44 rounded-full bg-danger/10 blur-3xl pointer-events-none" />
            <span aria-hidden="true" className="absolute -bottom-24 -left-16 size-44 rounded-full bg-danger/5 blur-3xl pointer-events-none" />

            {/* Icon tile — a real gradient (color-mix off the one danger token, not a second hue)
                with a soft double pulse behind it, the same "something needs attention right now"
                language RecentActivity's fresh-item ping already uses elsewhere in the app. */}
            <div className="relative flex size-16 shrink-0 items-center justify-center">
              <span className="absolute inset-0 rounded-2xl bg-danger/25 motion-safe:animate-ping" />
              <span className="absolute inset-[-6px] rounded-[1.25rem] border border-danger/20" />
              <div
                className="relative flex size-16 items-center justify-center rounded-2xl text-white ring-1 ring-danger/40"
                style={{ background: 'linear-gradient(135deg, var(--color-danger) 0%, color-mix(in srgb, var(--color-danger) 65%, black) 100%)' }}
              >
                <AlertTriangle size={28} strokeWidth={1.75} />
              </div>
            </div>

            <div className="relative flex flex-col gap-1.5">
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
              <ul className="relative w-full flex flex-col gap-1.5 text-left">
                {overdueInstances.slice(0, PREVIEW_LIMIT).map((instance) => (
                  <li
                    key={instance.id}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-danger/[0.06] border border-danger/15 text-sm font-display font-semibold text-text transition-colors duration-150 hover:bg-danger/10"
                  >
                    <span className="flex items-center justify-center size-7 rounded-lg bg-danger/15 text-danger shrink-0">
                      <Clock3 size={14} strokeWidth={2.25} />
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

            <div className="relative flex flex-col sm:flex-row-reverse gap-2.5 w-full pt-1">
              <button
                type="button"
                onClick={goFillIt}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl text-white text-sm font-display font-semibold shadow-sm shadow-danger/30 cursor-pointer transition-all duration-150 hover:brightness-110 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-danger/40 focus-visible:ring-offset-2"
                style={{ background: 'linear-gradient(135deg, var(--color-danger) 0%, color-mix(in srgb, var(--color-danger) 70%, black) 100%)' }}
              >
                Go fill it now
                <ArrowRight size={15} />
              </button>
              <button
                type="button"
                onClick={acknowledge}
                className="flex-1 inline-flex items-center justify-center h-11 px-4 rounded-xl border border-border bg-surface text-sm font-display font-medium text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-surface-hover outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                Remind me later
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
