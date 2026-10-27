import { useRef, type ReactNode } from 'react';
import { SheetGrabHandle } from '@/components/sheetGrabHandle';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BarChart3, BellRing, CalendarClock, CheckCheck, ClipboardList, MessageCircle, Repeat, Ticket, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../../components/ui/sheet';
import { Button, DepartmentChip, IconChip, InlineError, NoticeBanner, RoleChip, Skeleton, StoreChip } from '../../components';
import { RadialGauge } from '../../components/radialGauge/RadialGauge';
import { useIsMobile } from '../../lib/useMediaQuery';
import { handleQueryRetry } from '../../lib/queryHelpers';
import { ApiError } from '../../api/http';
import { scoreApi } from '../../api/scores';
import type { PersonAttentionDetail } from '../../api/exceptions';
import type { Role } from '../../api/auth';
import { useOrgToday } from '../checklist/useOrgToday';
import { scoresHref } from '../admin/directory/orgScoreData';
import { useNow, usePersonAttention, useRemindMutation } from './useAttention';
import { LevelAvatar, WeekDots } from './AttentionParts';
import { LEVEL_LOOK, RUN_LOOK, agoLabel, deadlineLabel, levelOfDetail, pctText, remindedRecently, scoreBar, scoreTone, whatsAppLink } from './attentionDisplay';
import { GOOD_FROM, FAIR_FROM } from '../../lib/scoreBands';

const gaugeColor = (v: number | null | undefined) =>
  v === null || v === undefined ? 'var(--color-border-hover)' : v >= GOOD_FROM ? 'var(--color-success)' : v >= FAIR_FROM ? 'var(--color-warning)' : 'var(--color-danger)';

const reasonsOf = (d: PersonAttentionDetail) => {
  const count = (n: number, one: string, many: string) => (n > 0 ? `${n} ${n === 1 ? one : many}` : null);
  return [
    count(d.runs.filter((r) => r.state === 'missed').length, 'checklist not filled', 'checklists not filled'),
    count(d.runs.filter((r) => r.closingSoon).length, 'closes within the hour', 'close within the hour'),
    count(d.tickets.filter((t) => t.isOverdue).length, 'ticket overdue', 'tickets overdue'),
    count(d.delegations.filter((t) => t.overdue).length, 'delegation overdue', 'delegations overdue'),
    count(d.runs.filter((r) => r.state === 'not_started').length, 'not started yet', 'not started yet'),
    count(d.runs.filter((r) => r.state === 'to_submit').length, 'ticked but not submitted', 'ticked but not submitted'),
    count(d.runs.filter((r) => r.state === 'sent_back').length, 'sent back to fix', 'sent back to fix'),
  ].filter(Boolean).join(', ');
};

const Gauge = ({ value, label, caption }: { value: number | null | undefined; label: string; caption?: string }) => (
  <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
    <RadialGauge percent={value ?? 0} size={76} variant="circle" thickness={8} gradientFrom={gaugeColor(value)} gradientTo={gaugeColor(value)} ariaLabel={`${label} ${pctText(value)}`}>
      <span className={cn('t-card font-display font-extrabold tabular-nums', value === null || value === undefined ? 'text-text-light' : 'text-text')}>{pctText(value)}</span>
    </RadialGauge>
    <span className="t-meta font-semibold text-text-secondary text-center">{label}</span>
    {caption && <span className="t-meta text-text-muted text-center line-clamp-1">{caption}</span>}
  </div>
);

const MonthStat = ({ label, value }: { label: string; value: number | null | undefined }) => (
  <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-border/60 bg-surface px-3 py-2.5">
    <span className="t-meta font-medium text-text-muted line-clamp-1">{label}</span>
    <span className={cn('t-stat font-display font-bold tabular-nums leading-none', scoreTone(value))}>{pctText(value)}</span>
    <span className="h-1 w-full overflow-hidden rounded-full bg-border/60">
      <span className={cn('block h-full rounded-full transition-[width] duration-500 ease-out', scoreBar(value))} style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
    </span>
  </div>
);

const Section = ({ icon: Icon, title, aside, children }: { icon: LucideIcon; title: string; aside?: ReactNode; children: ReactNode }) => (
  <section className="flex flex-col gap-3">
    <div className="flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 t-card font-display font-bold text-text">
        <Icon className="size-4 text-text-muted" aria-hidden />
        {title}
      </h3>
      {aside}
    </div>
    {children}
  </section>
);

const ROW_LINK = 'flex items-center gap-3 min-h-14 rounded-xl border border-border/60 bg-surface px-3 py-2.5 outline-none transition-colors duration-150 hover:border-primary-300 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40';

const DetailSkeleton = () => (
  <div className="flex flex-col gap-5 p-4 sm:p-6" role="status" aria-label="Loading">
    <div className="flex items-center gap-3">
      <Skeleton className="size-12 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-6 w-2/3 rounded-full" />
      </div>
    </div>
    <Skeleton className="h-14 w-full rounded-xl" />
    <div className="flex justify-around gap-3">
      {[0, 1, 2].map((i) => <Skeleton key={i} className="size-19 rounded-full" />)}
    </div>
    {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
  </div>
);

interface PersonAttentionSheetProps {
  userId: string | null;
  onClose: () => void;
}

export const PersonAttentionSheet = ({ userId, onClose }: PersonAttentionSheetProps) => {
  const isMobile = useIsMobile();
  const contentRef = useRef<HTMLDivElement>(null);
  const now = useNow();
  const today = useOrgToday();
  const monthFrom = `${today.slice(0, 8)}01`;
  const detail = usePersonAttention(userId);
  const remind = useRemindMutation();

  const todayScore = useQuery({
    queryKey: ['scores', 'attention-person', userId, today, today],
    queryFn: () => scoreApi.get({ scope: 'person', id: userId!, from: today, to: today }),
    enabled: !!userId,
    retry: handleQueryRetry,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const monthScore = useQuery({
    queryKey: ['scores', 'attention-person', userId, monthFrom, today],
    queryFn: () => scoreApi.get({ scope: 'person', id: userId!, from: monthFrom, to: today }),
    enabled: !!userId,
    retry: handleQueryRetry,
    staleTime: 60_000,
  });

  const d = detail.data;
  const level = d ? levelOfDetail(d) : null;
  const reasons = d ? reasonsOf(d) : '';
  const forbidden = detail.error instanceof ApiError && (detail.error.status === 403 || detail.error.status === 404);
  const recently = d ? remindedRecently(d.lastRemindedAt, now) : false;
  const firstName = d?.name.split(' ')[0] ?? '';
  const month = monthScore.data;
  const approvedRate = month && month.checklist.submitted > 0 ? (month.checklist.approved / month.checklist.submitted) * 100 : null;
  const t = todayScore.data;
  const runsDone = d ? d.runs.filter((r) => r.state === 'submitted').length : 0;
  const runsDue = d ? d.runs.filter((r) => r.state !== 'upcoming').length : 0;

  const whatsAppText = reasons
    ? `Hi ${firstName}, a quick reminder: ${reasons}. Please finish them in KaryaOS.`
    : `Hi ${firstName}, please check your checklists and tasks for today in KaryaOS.`;
  const whatsApp = d?.phone ? whatsAppLink(d.phone, whatsAppText) : null;

  return (
    <Sheet open={!!userId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        ref={contentRef}
        side={isMobile ? 'bottom' : 'right'}
        showCloseButton={false}
        className={cn(
          'p-0 flex flex-col overflow-hidden font-sans shadow-none gap-0',
          isMobile ? 'max-h-[92dvh] rounded-t-2xl' : 'w-full sm:max-w-[520px] h-full',
        )}
      >
        <SheetTitle className="sr-only">{d?.name ?? 'Person'}</SheetTitle>
        <SheetDescription className="sr-only">Live view of today's checklists, scores and open work.</SheetDescription>

        {isMobile && <SheetGrabHandle targetRef={contentRef} onClose={onClose} />}

        <header className="flex items-start gap-3 border-b border-border/60 px-4 pt-3 pb-3 sm:px-6 sm:pt-5 sm:pb-4">
          {d ? (
            <>
              <LevelAvatar name={d.name} src={d.avatarUrl} level={level} size="lg" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="t-section font-display font-bold text-text leading-tight line-clamp-2">{d.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  <RoleChip role={d.role as Role} />
                  {d.departmentName && <DepartmentChip name={d.departmentName} />}
                  {d.storeName && <StoreChip name={d.storeName} />}
                </div>
                <p className="flex items-center gap-1.5 t-meta font-medium text-text-muted">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full rounded-full bg-success opacity-60 animate-ping motion-reduce:animate-none" />
                    <span className="relative inline-flex size-2 rounded-full bg-success" />
                  </span>
                  Live, updated {agoLabel(new Date(detail.dataUpdatedAt || now).toISOString(), now)}
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1" />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full text-text-muted outline-none transition-colors duration-150 hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {detail.isPending ? (
            <DetailSkeleton />
          ) : forbidden ? (
            <div className="p-4 sm:p-6">
              <NoticeBanner tone="neutral" icon={AlertTriangle}>You can only open people in your own department.</NoticeBanner>
            </div>
          ) : detail.isError || !d ? (
            <div className="p-4 sm:p-6">
              <InlineError message="Couldn't load this person." onRetry={() => void detail.refetch()} />
            </div>
          ) : (
            <div className="flex flex-col gap-6 px-4 py-4 sm:px-6 sm:py-5">
              {level ? (
                <div className={cn('flex items-start gap-3 rounded-xl border p-3.5', level === 'red' ? 'border-danger/30' : 'border-warning/30', LEVEL_LOOK[level].soft)}>
                  <AlertTriangle className={cn('size-5 shrink-0', LEVEL_LOOK[level].text)} aria-hidden />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className={cn('t-card font-display font-bold', LEVEL_LOOK[level].text)}>{LEVEL_LOOK[level].label}</p>
                    <p className="t-meta font-medium text-text-secondary">{reasons}</p>
                  </div>
                </div>
              ) : (
                <NoticeBanner tone="success" icon={CheckCheck}>On track today. Nothing late or waiting on them.</NoticeBanner>
              )}

              <Section icon={BarChart3} title="Today" aside={<span className="t-meta font-medium text-text-muted">{runsDue ? `${runsDone} of ${runsDue} checklists submitted` : 'No checklists due yet'}</span>}>
                {todayScore.isPending ? (
                  <div className="flex justify-around gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="size-19 rounded-full" />)}</div>
                ) : todayScore.isError ? (
                  <InlineError message="Couldn't load today's score." onRetry={() => void todayScore.refetch()} />
                ) : (
                  <div className="flex items-start justify-around gap-2 rounded-xl border border-border/60 bg-surface-hover/30 px-2 py-3">
                    <Gauge value={t?.checklist.completionPct} label="Completion" caption={t?.checklist.due ? `${t.checklist.done} of ${t.checklist.due} due` : 'None closed yet'} />
                    <Gauge value={t?.checklist.compliancePct} label="Compliance" caption={t?.checklist.answersChecked ? `${t.checklist.answersChecked} answers checked` : 'Not checked yet'} />
                    <Gauge value={t?.overall} label="Overall" caption="All work today" />
                  </div>
                )}
              </Section>

              <Section icon={CalendarClock} title="This month" aside={approvedRate !== null ? <span className="t-meta font-semibold text-text-secondary">Approved {pctText(approvedRate)}</span> : undefined}>
                {monthScore.isPending ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-19 rounded-xl" />)}</div>
                ) : monthScore.isError ? (
                  <InlineError message="Couldn't load this month's score." onRetry={() => void monthScore.refetch()} />
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <MonthStat label="Overall" value={month?.overall} />
                    <MonthStat label="Checklists" value={month?.checklist.score} />
                    <MonthStat label="Tickets" value={month?.ticket.score} />
                    <MonthStat label="Delegations" value={month?.delegation.score} />
                  </div>
                )}
              </Section>

              <Section icon={Repeat} title="Last 7 days" aside={d.missedStreak >= 2 ? <IconChip icon={Repeat} tone="bg-coral-500" label={`Missed ${d.missedStreak} days running`} /> : undefined}>
                <WeekDots cells={d.week} />
              </Section>

              <Section icon={ClipboardList} title="Today's checklists">
                {d.runs.length === 0 ? (
                  <p className="t-meta font-medium text-text-muted">Nothing due today.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {d.runs.map((r) => {
                      const look = RUN_LOOK[r.state];
                      const pct = r.totalItems ? Math.round((r.doneItems / r.totalItems) * 100) : 0;
                      return (
                        <li key={r.id}>
                          <Link to={`/checklists/${r.id}`} viewTransition className={ROW_LINK}>
                            <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl text-white', look.tone)}>
                              <look.icon className="size-4" strokeWidth={2.25} aria-hidden />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                              <span className="line-clamp-2 t-card font-display font-semibold text-text leading-snug">{r.title}</span>
                              <span className="flex items-center gap-2 t-meta font-medium text-text-muted">
                                <span className={cn(look.text, 'font-semibold')}>{look.label}</span>
                                <span aria-hidden>·</span>
                                <span className={cn(r.closingSoon && 'text-danger font-semibold')}>{deadlineLabel(r.deadline, now)}</span>
                              </span>
                              <span className="flex items-center gap-2">
                                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/60">
                                  <span className={cn('block h-full rounded-full', r.state === 'missed' ? 'bg-danger' : r.state === 'submitted' ? 'bg-success' : 'bg-primary-500')} style={{ width: `${pct}%` }} />
                                </span>
                                <span className="t-meta font-semibold tabular-nums text-text-secondary">{r.doneItems}/{r.totalItems}</span>
                              </span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>

              {(d.tickets.length > 0 || d.delegations.length > 0) && (
                <Section icon={Ticket} title="Open work">
                  <ul className="flex flex-col gap-2">
                    {d.tickets.map((tk) => (
                      <li key={tk.id}>
                        <Link to={`/tickets?open=${tk.id}`} viewTransition className={ROW_LINK}>
                          <span className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="line-clamp-2 t-card font-display font-semibold text-text leading-snug">{tk.title}</span>
                            <span className="t-meta font-medium text-text-muted">Ticket{tk.tatDueAt ? ` · due ${new Date(tk.tatDueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</span>
                          </span>
                          {tk.isOverdue ? <IconChip icon={AlertTriangle} tone="bg-danger" label="Overdue" labelClassName="text-danger" /> : <IconChip icon={false} label="Open" />}
                        </Link>
                      </li>
                    ))}
                    {d.delegations.map((tk) => (
                      <li key={tk.id}>
                        <Link to={`/tasks?open=${tk.id}`} viewTransition className={ROW_LINK}>
                          <span className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="line-clamp-2 t-card font-display font-semibold text-text leading-snug">{tk.title}</span>
                            <span className="t-meta font-medium text-text-muted">Delegation{tk.dueDate ? ` · due ${new Date(tk.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</span>
                          </span>
                          {tk.overdue ? <IconChip icon={AlertTriangle} tone="bg-danger" label="Overdue" labelClassName="text-danger" /> : <IconChip icon={false} label="Open" />}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>
          )}
        </div>

        {d && (
          <footer className="flex items-center gap-2 border-t border-border/60 bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6">
            <Button
              type="button"
              variant="primary"
              size="md"
              className="flex-1 min-w-0 pointer-coarse:h-11"
              onClick={() => remind.mutate([d.userId])}
              isLoading={remind.isPending}
              disabled={recently || !d.isActive}
            >
              <BellRing className="size-4" aria-hidden />
              <span className="truncate">{recently && d.lastRemindedAt ? `Reminded ${agoLabel(d.lastRemindedAt, now)}` : 'Send reminder'}</span>
            </Button>
            {whatsApp && (
              <a
                href={whatsApp}
                target="_blank"
                rel="noreferrer"
                aria-label={`WhatsApp ${firstName}`}
                className="inline-flex size-11 sm:size-auto sm:h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface sm:px-3 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:border-success/50 hover:text-success focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                <MessageCircle className="size-4" aria-hidden />
                <span className="max-sm:sr-only">WhatsApp</span>
              </a>
            )}
            <Link
              to={scoresHref('person', d.userId, d.name, monthFrom, today)}
              viewTransition
              aria-label="Full score"
              className="inline-flex size-11 sm:size-auto sm:h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface sm:px-3 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:border-primary-300 hover:text-primary-700 dark:hover:text-primary-300 focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <BarChart3 className="size-4" aria-hidden />
              <span className="max-sm:sr-only">Full score</span>
            </Link>
          </footer>
        )}
      </SheetContent>
    </Sheet>
  );
};
