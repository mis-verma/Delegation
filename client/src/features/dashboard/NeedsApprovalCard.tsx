import { useMemo } from 'react';
import { Link } from 'react-router';
import { ShieldAlert, TicketCheck, CheckSquare, ClipboardCheck, ChevronRight, Check, type LucideIcon } from 'lucide-react';
import { IconChip } from '../../components/iconChip';
import { useTaskPendingApprovalQuery } from '../tasks/hook';
import { useTicketPendingApprovalQuery } from '../tickets/hook';
import { useChecklistPendingApprovalQuery } from '../checklist/hook';
import { formatRelativeTime, ACTIVITY_CATEGORY_LABEL, ACTIVITY_CATEGORY_DOT_CLASS, DASHBOARD_CARD_CLASS } from './dashboardDisplay';

type ApprovalCategory = 'ticket' | 'delegation' | 'checklist';

interface ApprovalRow {
  id: string;
  category: ApprovalCategory;
  title: string;
  /** Submitter name for ticket/delegation, store name for checklist (no single submitter there
   *  — see checklistInstance.service.ts#pendingApprovalPreview's own doc comment). */
  meta: string | null;
  waitingSince: string;
  link: string;
}

const CATEGORY_ICON: Record<ApprovalCategory, LucideIcon> = {
  ticket: TicketCheck,
  delegation: CheckSquare,
  checklist: ClipboardCheck,
};

// Same "preview, not the whole queue" convention as DrilldownList's PREVIEW_LIMIT — this card is
// a way in, not a second queue-management page (that's each module's own pending-verification
// view).
const PREVIEW_LIMIT = 6;

/**
 * The one dashboard card built from other people's submissions rather than the viewer's own
 * work — every ADMIN/PC can verify any pending ticket, delegation, or checklist org-wide (see
 * each module's own pendingApproval doc comment), so this combines all three into a single
 * oldest-waiting-first queue instead of three separate "pending" filters to remember to check.
 */
export const NeedsApprovalCard = () => {
  const { data: taskItems, isPending: taskPending } = useTaskPendingApprovalQuery();
  const { data: ticketItems, isPending: ticketPending } = useTicketPendingApprovalQuery();
  const { data: checklistItems, isPending: checklistPending } = useChecklistPendingApprovalQuery();
  const isPending = taskPending || ticketPending || checklistPending;

  const rows = useMemo<ApprovalRow[]>(() => {
    const combined: ApprovalRow[] = [
      ...(ticketItems ?? []).map((t): ApprovalRow => ({
        id: t.id, category: 'ticket', title: t.title, meta: t.submittedBy, waitingSince: t.waitingSince, link: `/tickets?open=${t.id}`,
      })),
      ...(taskItems ?? []).map((t): ApprovalRow => ({
        id: t.id, category: 'delegation', title: t.title, meta: t.submittedBy, waitingSince: t.waitingSince, link: `/tasks?open=${t.id}`,
      })),
      ...(checklistItems ?? []).map((c): ApprovalRow => ({
        id: c.id, category: 'checklist', title: c.title, meta: c.storeName, waitingSince: c.waitingSince, link: `/checklists/${c.id}`,
      })),
    ];
    return combined.sort((a, b) => new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime());
  }, [ticketItems, taskItems, checklistItems]);

  const visible = rows.slice(0, PREVIEW_LIMIT);
  const remaining = rows.length - visible.length;
  const counts = visible.reduce<Partial<Record<ApprovalCategory, number>>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section aria-labelledby="needs-approval-heading" className={`${DASHBOARD_CARD_CLASS} flex flex-col`}>
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-border/40">
        <div className="flex items-center gap-3.5 min-w-0">
          {/* One-off warm tile, not EntityIconTile's shared primary/coral — coral there is
              scoped specifically to physical stores, and this card's whole point is the one
              place on the dashboard that reads as "time-sensitive", so it earns its own accent. */}
          <div className="flex items-center justify-center size-10 rounded-xl shrink-0 text-warning bg-gradient-to-br from-warning/20 to-danger/10 border border-warning/25">
            <ShieldAlert size={18} strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <h2 id="needs-approval-heading" className="text-base sm:text-lg font-display font-bold text-text tracking-tight truncate">
              Needs your approval
            </h2>
            <p className="text-[11px] sm:text-xs font-medium text-text-muted mt-0.5">
              Tickets, delegations, and checklists waiting on your sign-off
            </p>
          </div>
        </div>
        {rows.length > 0 && (
          <span className="shrink-0 inline-flex items-center justify-center min-w-[1.375rem] h-[1.375rem] px-1.5 rounded-full bg-warning/15 text-warning text-xs font-display font-bold tabular-nums">
            {rows.length}
          </span>
        )}
      </div>

      {isPending ? (
        <div className="flex flex-col gap-1.5 p-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-[3.25rem] rounded-xl border border-border/60 dark:border-white/[0.06] bg-surface-hover/60 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        // No CTA here, unlike every other empty state on this dashboard — this card is entirely
        // derived from other people's submissions, there's nothing for the viewer to go create.
        <div className="flex flex-col items-center justify-center flex-1 py-12 text-center gap-3">
          <div className="flex items-center justify-center size-11 rounded-full bg-success/10 text-success">
            <Check size={20} strokeWidth={2.5} />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-display font-semibold text-text">All caught up</p>
            <p className="text-xs font-medium text-text-muted">Nothing is waiting on your review right now.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-3 sm:p-4">
          <div className="flex flex-wrap gap-2 px-1">
            {(['ticket', 'delegation', 'checklist'] as const)
              .filter((c) => counts[c])
              .map((c) => (
                <IconChip
                  key={c}
                  icon={CATEGORY_ICON[c]}
                  label={`${counts[c]} ${ACTIVITY_CATEGORY_LABEL[c].toLowerCase()}${counts[c] === 1 ? '' : 's'}`}
                  tone={ACTIVITY_CATEGORY_DOT_CLASS[c]}
                />
              ))}
          </div>

          <div className="flex flex-col gap-1.5">
            {visible.map((row) => {
              const Icon = CATEGORY_ICON[row.category];
              return (
                <Link
                  key={`${row.category}-${row.id}`}
                  to={row.link}
                  className="group/row flex items-center gap-3 rounded-xl border border-border/60 dark:border-white/[0.06] bg-surface px-3.5 py-3 transition-colors duration-200 hover:border-warning/40 hover:bg-warning/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                >
                  <div className={`flex items-center justify-center size-9 rounded-lg shrink-0 text-white ${ACTIVITY_CATEGORY_DOT_CLASS[row.category]}`}>
                    <Icon size={15} strokeWidth={2.25} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* line-clamp-2, not truncate — this row's icon+chevron chrome left barely
                        any width for the title on a phone, cutting "Damaged flooring near..."
                        down to a fragment. Two lines still bounds each row's height. */}
                    <p className="text-sm font-display font-semibold text-text line-clamp-2 leading-snug">{row.title}</p>
                    <p className="text-[11px] font-medium text-text-light mt-0.5 flex items-center gap-1.5">
                      {row.meta && (
                        <>
                          <span className="truncate">{row.meta}</span>
                          <span className="size-1 rounded-full bg-border shrink-0" />
                        </>
                      )}
                      <span className="text-warning font-semibold shrink-0">{formatRelativeTime(row.waitingSince)}</span>
                    </p>
                  </div>
                  <ChevronRight size={16} strokeWidth={2.5} className="shrink-0 text-text-light group-hover/row:text-warning transition-colors duration-200" />
                </Link>
              );
            })}
          </div>

          {remaining > 0 && (
            <p className="text-[11px] font-medium text-text-light text-center">+{remaining} more waiting</p>
          )}
        </div>
      )}
    </section>
  );
};
