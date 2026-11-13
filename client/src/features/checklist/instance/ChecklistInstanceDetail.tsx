import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { haptic } from '../../../lib/haptics';
import { useRefreshOnNewDay } from '../useRefreshOnNewDay';
import { useParams, useNavigate } from 'react-router';
import { ArrowDown, ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, CheckCheck, ShieldQuestion, CornerUpLeft, Pencil, Clock, ClipboardX, ListTodo, Eye } from 'lucide-react';
import { PeriodTabControl } from '../../dashboard/PeriodTabControl';
import { useMyExtraWorkingDaysQuery } from '../../admin/holidays/hook';
import { cn } from '@/lib/utils';
import {
  Button, ChecklistProgressBar, Collapse, EmptyState, IconChip, InlineError, NoticeBanner, PANEL_CLASS, Skeleton, StatusChip, VerificationNoteBanner, Fab } from '../../../components';
import { useChecklistInstanceQuery } from '../hook';
import { useReviewDraft } from '../../verification/useReviewDraft';
import { pickDefaults, runCorrectionItems } from '../../verification/correctionItems';
import { canWaiveRun } from './canWaive';
import { ApiError } from '../../../api/http';
import { ChecklistReviewBar } from './ChecklistReviewBar';
import { CompletedGroup } from './CompletedGroup';
import { SendBackSummary } from './SendBackSummary';
import { CorrectionRoundContext, sentBackAtOf } from './correctionRound';
import { PhotoReviewContext } from './photoReviewContext';
import { DetailItemRow } from './ChecklistDetailItemRow';
import {
  complianceToneClass, describeInstanceEnd, formatDateTime, getInstanceView, instanceClosing, instanceProgressToneClass, isInstanceEnded, instanceOpensOnLaterDay, isInstanceInLateWindow, isInstanceNotYetOpen,
  RECURRENCE_LABEL, formatPeriodSpan } from '../checklistDisplay';
import { useNow } from '../../../lib/useNow';
import { useDoneLast } from '../../../lib/useDoneLast';
import { useRowActivity } from '../../../lib/useRowActivity';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import { SmoothItem } from '../../../components/smoothItem';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';
import { LateCountdownChip, LateWindowBanner } from './LateWindowBanner';
import { useAuth } from '../../../context/AuthContext';
import { useSubmitRun } from './fill/useSubmitRun';
import { FillBottomBar } from './fill/FillBottomBar';
import { FillAside } from './fill/FillAside';
import { auditPeopleProgress, sectionKeyOf, sectionsOf, type FillProgress } from './fill/fillProgress';

const NO_ITEMS: ChecklistInstanceItem[] = [];

type ShowMode = 'section' | 'all' | 'left' | 'one';
type ItemGroup = { section: string | null; items: ChecklistInstanceItem[]; done?: boolean };
const DONE_GROUP_ID = 'section-completed';
type RunLabels = { storeName?: string | null; assigneeNames?: string[] };

const isAnswered = (i: ChecklistInstanceItem) => i.isDone || i.isNotApplicable;
const rowDomId = (id: string) => `item-${id}`;
const SETTLE_AND_MOVE_MS = 900;
const focusRow = (id: string) => {
  const row = document.getElementById(rowDomId(id));
  if (!row) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  row.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  row.focus({ preventScroll: true });
};

const namesLine = (names: string[] | undefined) => {
  if (!names?.length) return null;
  return names.length <= 2 ? names.join(' and ') : `${names[0]}, ${names[1]} and ${names.length - 2} more`;
};

const DetailSkeleton = () => (
  <div className="flex flex-col gap-6 w-full" role="status" aria-label="Loading checklist">
    <div className="flex items-center justify-between gap-3">
      <Skeleton className="h-8 pointer-coarse:h-11 w-20 rounded-md" />
    </div>
    <div className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-4 sm:p-5')}>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-28 rounded-full" />
      </div>
      <div className="flex flex-col gap-2 pt-1">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
    </div>
    <div className="flex flex-col gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-4 min-h-24')}>
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  </div>
);

export const ChecklistInstanceDetail = () => {
  const { instanceId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  useRefreshOnNewDay();
  const now = useNow();
  const isPhone = useMediaQuery('(max-width: 639px)');
  const { data: instance, isPending, isError, error, refetch } = useChecklistInstanceQuery(instanceId);
  const draft = useReviewDraft(instanceId || null);
  const submitSummary = useCallback(() => {
    const items = instance?.items ?? [];
    const na = items.filter((i) => i.isNotApplicable).length;
    const answered = items.length - na;
    return {
      title: `Submit "${instance?.title ?? 'this checklist'}"?`,
      description: `${answered} ${answered === 1 ? 'question' : 'questions'} answered${na ? `, ${na} not applicable` : ''}. It goes to your department head first, then PC. You can take it back within 10 minutes if you spot a mistake.`,
    };
  }, [instance]);
  const submit = useSubmitRun(instanceId, submitSummary);
  const sentBackId = instance?.verificationStatus === 'REJECTED' && user?.role !== 'ADMIN' && user?.role !== 'PC' ? instance.id : null;
  useEffect(() => { if (sentBackId) haptic('warning'); }, [sentBackId]);
  const status = instance?.verificationStatus;
  const previousStatus = useRef(status);
  useEffect(() => {
    const before = previousStatus.current;
    previousStatus.current = status;
    if (status === 'PENDING_APPROVAL' && (before === 'NOT_SUBMITTED' || before === 'REJECTED') && instance?.submittedBy === user?.id) {
      haptic('success');
      toast.success('Sent for approval. You can take it back for 10 minutes from the Preview on the list.');
    }
  }, [status, instance?.submittedBy, user?.id]);
  const { data: myExtraDays } = useMyExtraWorkingDaysQuery();
  const [pickedShow, setShow] = useState<ShowMode | null>(null);
  const [oneIndex, setOneIndex] = useState(0);
  const [pickedSection, setPickedSection] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<ReadonlySet<string>>(() => new Set());
  const [doneOpen, setDoneOpen] = useState(true);
  const [editAnswers, setEditAnswers] = useState(false);
  const goBackAfterDecision = () => {
    const hasHistory = typeof window !== 'undefined' && typeof window.history.state?.idx === 'number' && window.history.state.idx > 0;
    if (hasHistory) navigate(-1);
    else navigate(user?.role === 'ADMIN' || user?.role === 'PC' ? '/verify' : '/checklists/approvals', { replace: true });
  };

  const rowIsBusy = useRowActivity(rowDomId);
  const { pending: pendingItems, done: answeredItems, settling } = useDoneLast(instance?.items ?? NO_ITEMS, isAnswered, rowIsBusy);

  if (isPending) return <DetailSkeleton />;

  const isDeleted = error instanceof ApiError && error.status === 404;
  if (isDeleted) {
    return (
      <div className="w-full py-16 flex flex-col items-center gap-3 text-center">
        <span className="flex items-center justify-center size-12 rounded-lg border border-border/60 bg-muted/60 text-text-muted">
          <ClipboardX className="size-6" strokeWidth={2.25} aria-hidden />
        </span>
        <h1 className="t-section font-display font-bold text-text">This checklist run is no longer available</h1>
        <p className="text-sm font-display text-text-muted max-w-sm">
          It may have been part of a checklist that's since been deleted.
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate('/checklists')}>
          <ArrowLeft size={13} aria-hidden />
          Back to My Checklists
        </Button>
      </div>
    );
  }

  if (isError || !instance) {
    return (
      <div className="w-full">
        <InlineError message="We couldn't load this checklist. Check your connection and try again." onRetry={() => refetch()} />
      </div>
    );
  }

  const { done, total, progress, isComplete, overdue, chipStatus, compliance, scored, good, verification, doneLate } = getInstanceView(instance);
  const labels = instance as typeof instance & RunLabels;
  const inLateWindow = isInstanceInLateWindow(instance, isComplete, now);
  const isAdminOrPC = user?.role === 'ADMIN' || user?.role === 'PC';
  const isMissed = instance.isMissed === true || isInstanceEnded(instance, now);
  const closedWhen = describeInstanceEnd(instance.endedAt ? new Date(instance.endedAt).getTime() : instanceClosing(instance));
  const canWorkRaw = isAdminOrPC || (!!user && instance.assigneeIds.includes(user.id) && !isMissed);
  const isLocked = instance.verificationStatus === 'APPROVED';
  const canWaive = canWaiveRun(user, instance);
  const correctionById = new Map(runCorrectionItems(instance.items).map((c) => [c.id, c]));
  const togglePick = (id: string) => {
    if (draft.pickedSet.has(id)) draft.togglePicked(id);
    else draft.pickWith(id, pickDefaults(correctionById.get(id) ?? { problems: [], canPhotoOnly: false }));
  };
  const headDone = instance.approvalStage === 'PC' && (user?.role === 'MANAGER' || user?.role === 'SENIOR') && !instance.reviewerIds.includes(user.id);
  const canReview =
    instance.verificationStatus === 'PENDING_APPROVAL' &&
    !headDone &&
    !(user?.role === 'PC' && instance.coordinatorRun) &&
    !!user && (user.role === 'ADMIN' || !instance.assigneeIds.includes(user.id)) && (isAdminOrPC || user.role === 'MANAGER' || user.role === 'SENIOR' || instance.reviewerIds.includes(user.id));
  const canWork = canWorkRaw && (!canReview || editAnswers);
  const notYetOpen = isInstanceNotYetOpen(instance);
  const canSubmit =
    !!user && (user.role === 'ADMIN' || instance.assigneeIds.includes(user.id)) && canWork && isComplete && !notYetOpen &&
    (instance.verificationStatus === 'NOT_SUBMITTED' || instance.verificationStatus === 'REJECTED');
  const resubmit = instance.verificationStatus === 'REJECTED';
  const hasSections = instance.items.some(i => i.section);
  const sections = hasSections ? sectionsOf(instance.items, isAnswered) : [];
  const overtime = (myExtraDays ?? []).find((d) => d.date === instance.periodStart.slice(0, 10));
  const answered = (i: (typeof instance.items)[number]) => i.isDone || i.isNotApplicable;
  const left = Math.max(0, total - done);
  const fillProgress: FillProgress = { done, total, left, overdue, people: auditPeopleProgress(instance.items) };
  const filling = canWork && !isLocked && total > 0 && !canReview;
  const autoShow: ShowMode = hasSections && isPhone && filling ? 'section' : 'all';
  const show: ShowMode = canReview ? 'all' : pickedShow === 'section' && !hasSections ? 'all' : pickedShow ?? autoShow;
  const lastIndex = Math.max(0, instance.items.length - 1);
  const currentIndex = Math.min(oneIndex, lastIndex);
  const sentBackItems = instance.verificationStatus === 'REJECTED' ? instance.items.filter((i) => !i.isDone && !!i.sendBackNote) : [];
  const defaultSectionKey = (sentBackItems[0] && sectionKeyOf(sentBackItems[0]))
    ?? sections.find((s) => s.done < s.total)?.key
    ?? sections[0]?.key
    ?? '';
  const activeSectionKey = pickedSection !== null && sections.some((s) => s.key === pickedSection) ? pickedSection : defaultSectionKey;
  const activeSectionIndex = Math.max(0, sections.findIndex((s) => s.key === activeSectionKey));
  const reorder = canWork && !canReview && (show === 'all' || show === 'section');
  const doneAtBottom = reorder && show === 'all';
  const shownItems = show === 'left'
    ? instance.items.filter((i) => !answered(i) || settling.has(i.id))
    : show === 'one'
      ? instance.items.slice(currentIndex, currentIndex + 1)
      : show === 'section' && reorder
        ? [...pendingItems, ...answeredItems]
        : doneAtBottom
          ? pendingItems
          : instance.items;
  const bySection = (items: ChecklistInstanceItem[]): ItemGroup[] =>
    items.reduce<ItemGroup[]>((groups, item) => {
      const last = groups[groups.length - 1];
      if (last && last.section === (item.section ?? null)) last.items.push(item);
      else groups.push({ section: item.section ?? null, items: [item] });
      return groups;
    }, []);
  const itemGroups: ItemGroup[] = hasSections
    ? show === 'section'
      ? sections.map((s) => ({ section: s.key === '' ? null : s.key, items: shownItems.filter((i) => sectionKeyOf(i) === s.key) }))
      : bySection(shownItems)
    : shownItems.length ? [{ section: null, items: shownItems }] : [];
  if (doneAtBottom && answeredItems.length > 0) itemGroups.push({ section: null, items: answeredItems, done: true });
  const sectionCounts = new Map(sections.map((s) => [s.key, s]));
  const isCollapsed = (key: string, items: ChecklistInstanceItem[]) => {
    if (show !== 'all' || canReview || openSections.has(key)) return false;
    const counts = sectionCounts.get(key);
    return !!counts && counts.done === counts.total && !items.some((i) => settling.has(i.id));
  };
  const toggleSection = (key: string) => setOpenSections((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const pickSection = (key: string) => {
    if (show === 'section') {
      setPickedSection(key);
      requestAnimationFrame(() => document.getElementById(`section-${key || 'none'}`)?.scrollIntoView({ block: 'start' }));
      return;
    }
    if (show !== 'all') setShow('all');
    setOpenSections((prev) => new Set([...prev, key]));
    setDoneOpen(true);
    requestAnimationFrame(() => {
      const target = document.getElementById(`section-${key || 'none'}`) ?? document.getElementById(DONE_GROUP_ID);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  const goToItem = (target: ChecklistInstanceItem) => {
    const move = () => requestAnimationFrame(() => focusRow(target.id));
    if (show === 'one') {
      setOneIndex(instance.items.indexOf(target));
      requestAnimationFrame(move);
      return;
    }
    if (show === 'section') {
      const key = sectionKeyOf(target);
      if (key !== activeSectionKey) {
        setPickedSection(key);
        requestAnimationFrame(move);
        return;
      }
      move();
      return;
    }
    const key = sectionKeyOf(target);
    const inHiddenDone = doneAtBottom && !doneOpen && answeredItems.includes(target);
    const collapsed = inHiddenDone || (hasSections && isCollapsed(key, instance.items.filter((i) => sectionKeyOf(i) === key)));
    if (inHiddenDone) setDoneOpen(true);
    else if (collapsed) setOpenSections((prev) => new Set([...prev, key]));
    const switching = show === 'left' && !shownItems.includes(target);
    if (switching) setShow('all');
    if (settling.size > 0) window.setTimeout(move, SETTLE_AND_MOVE_MS);
    else if (switching || collapsed) requestAnimationFrame(move);
    else move();
  };
  const goToNext = () => {
    const inSection = show === 'section' ? instance.items.find((i) => !answered(i) && sectionKeyOf(i) === activeSectionKey) : undefined;
    const next = inSection ?? instance.items.find((i) => !answered(i));
    if (next) goToItem(next);
  };
  const verificationNote = instance.verificationNote;
  const showBanners =
    inLateWindow ||
    isMissed ||
    notYetOpen ||
    (instance.verificationStatus === 'PENDING_APPROVAL' && !canReview) ||
    (instance.verificationStatus === 'APPROVED' && !!verificationNote) ||
    (instance.verificationStatus === 'NOT_SUBMITTED' && !!verificationNote) ||
    instance.verificationStatus === 'REJECTED';
  const metaParts = [
    labels.storeName,
    namesLine(labels.assigneeNames),
    `${RECURRENCE_LABEL[instance.recurrence]}, ${formatPeriodSpan(instance)}`,
  ].filter(Boolean);
  const modeOptions = hasSections ? (['section', 'all', 'left', 'one'] as const) : (['all', 'left', 'one'] as const);
  const changeShow = (next: ShowMode) => {
    if (next === 'one') setOneIndex(Math.max(0, instance.items.findIndex((i) => !answered(i))));
    setShow(next);
  };
  const lateChip = inLateWindow ? <LateCountdownChip instance={instance} now={now} /> : null;
  const activeSection = sections[activeSectionIndex];

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className={'flex items-center justify-between gap-3 max-md:hidden'}>
        <Button variant="ghost" size="sm" className="max-md:hidden" onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/checklists', { replace: true }))} aria-label="Back">
          <ArrowLeft size={15} aria-hidden />
          Back
        </Button>

        {isAdminOrPC && (
          <Fab
            raised
            aria-label="Edit this checklist's template"
            actions={[{ key: 'edit-template', label: 'Edit template', icon: Pencil, onClick: () => navigate(`/admin/scheduled-checklists/builder/${instance.definitionId}`) }]}
          />
        )}
        {isAdminOrPC && (
          <Button
            variant="outline"
            size="sm"
            className="max-md:hidden"
            onClick={() => navigate(`/admin/scheduled-checklists/builder/${instance.definitionId}`)}
            title="Edit this checklist's template. Changes apply to future runs, not this one."
          >
            <Pencil size={13} aria-hidden />
            Edit template
          </Button>
        )}
      </div>

      <div className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-3.5 sm:p-5')}>
        <div className="flex flex-col gap-1">
          <h1 className="t-title font-display font-bold leading-snug text-text break-words">{instance.title.replace(/\.\s*$/, '')}</h1>
          <p className="t-meta font-display text-text-muted line-clamp-2">{metaParts.join(' · ')}</p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusChip status={chipStatus} showLabelOnMobile />
          {doneLate && <IconChip icon={Clock} tone="bg-warning" label="Done late" />}
          {overtime && <IconChip icon={Clock} tone="bg-warning" label={`Overtime: ${overtime.reason}`} />}
          {(isComplete || instance.verificationStatus !== 'NOT_SUBMITTED') && (
            <IconChip
              icon={verification.icon}
              tone={verification.tone}
              label={verification.label}
            />
          )}
          {instance.submittedAt && instance.verificationStatus !== 'NOT_SUBMITTED' && instance.verificationStatus !== 'REJECTED' && (
            <span className="t-meta font-medium text-text-muted">
              Submitted {formatDateTime(instance.submittedAt)}{instance.submittedByName ? ` by ${instance.submittedByName}` : ''}
            </span>
          )}
          {isLocked && instance.verifiedAt && (
            <span className="t-meta font-medium text-text-muted">on {formatDateTime(instance.verifiedAt)}</span>
          )}
        </div>

        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 tabular-nums sm:hidden">
          {compliance !== null && (
            <span className="flex items-baseline gap-1.5">
              <span className={cn('t-stat font-display font-bold leading-none', complianceToneClass(compliance))}>{compliance}%</span>
              <span className="t-meta font-medium text-text-secondary">compliance</span>
            </span>
          )}
          <span className="flex items-baseline gap-1.5">
            <span className={cn('t-stat font-display font-bold leading-none', instanceProgressToneClass(overdue, isComplete))}>{progress}%</span>
            <span className="t-meta font-medium text-text-secondary">complete</span>
          </span>
        </div>

        <div className={cn('hidden gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid lg:hidden', compliance !== null && 'sm:grid-cols-2')}>
          {compliance !== null && (
            <div className="flex flex-col gap-1.5 bg-surface p-4">
              <span className="t-meta font-display font-semibold text-text-muted">Compliance</span>
              <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 tabular-nums">
                <span className={cn('t-stat font-display font-bold leading-none', complianceToneClass(compliance))}>{compliance}%</span>
                <span className="t-meta font-medium text-text-secondary">{good} of {scored} answered well</span>
              </span>
              <ChecklistProgressBar done={good} total={scored} tone="auto" bare />
            </div>
          )}
          <div className="flex flex-col gap-1.5 bg-surface p-4">
            <span className="t-meta font-display font-semibold text-text-muted">Completion</span>
            <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 tabular-nums">
              <span className={cn('t-stat font-display font-bold leading-none', instanceProgressToneClass(overdue, isComplete))}>{progress}%</span>
              <span className="t-meta font-medium text-text-secondary">{done} of {total} done</span>
            </span>
            <ChecklistProgressBar done={done} total={total} tone={overdue ? 'danger' : 'auto'} bare />
          </div>
        </div>

        {filling && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
            <span className="t-meta font-display font-semibold text-text-muted">Show</span>
            <PeriodTabControl
              value={show}
              options={modeOptions}
              labels={{ section: 'Sections', all: 'All', left: `Left ${left}`, one: 'One by one' }}
              onChange={changeShow}
            />
          </div>
        )}

        {canReview && canWorkRaw && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
            <p className="t-meta font-display text-text-muted">
              {editAnswers ? 'You are changing the answers. Changes save straight away.' : 'Answers are read-only while you review.'}
            </p>
            <Button variant="outline" size="sm" className="pointer-coarse:h-11" onClick={() => setEditAnswers((v) => !v)} aria-pressed={editAnswers}>
              {editAnswers ? <Eye size={13} aria-hidden /> : <Pencil size={13} aria-hidden />}
              {editAnswers ? 'Done editing' : 'Edit answers'}
            </Button>
          </div>
        )}
      </div>

      {showBanners && (
        <div className="flex flex-col gap-3">
          {inLateWindow && <LateWindowBanner instance={instance} now={now} onFill={goToNext} />}

          {isMissed && (
            <NoticeBanner tone="warning" icon={Clock}>
              {isAdminOrPC ? (
                `This checklist closed at ${closedWhen} and counts as missed. You can still edit it as an admin.`
              ) : user && instance.assigneeIds.includes(user.id) ? (
                <div className="flex flex-col items-start gap-2">
                  <p>This checklist closed at {closedWhen}. It can't be filled in any more. Today's checklist is in My Checklists.</p>
                  <Button variant="outline" size="sm" onClick={() => navigate('/checklists')}>
                    Go to My Checklists
                  </Button>
                </div>
              ) : (
                `This checklist closed at ${closedWhen} and counts as missed. The people it was assigned to can no longer fill it in.`
              )}
            </NoticeBanner>
          )}

          {notYetOpen && (
            <NoticeBanner tone="neutral" icon={Clock}>
              {instanceOpensOnLaterDay(instance, now) ? `This checklist opens on ${instanceOpensOnLaterDay(instance, now)}. You can see it early, but it can only be filled from then.` : `This checklist opens at ${instance.opensTime}. Items can't be ticked off before then.`}
            </NoticeBanner>
          )}

          {instance.verificationStatus === 'PENDING_APPROVAL' && !canReview && (
            <NoticeBanner tone="info" icon={ShieldQuestion}>
              Submitted{instance.submittedByName ? ` by ${instance.submittedByName}` : ''}{instance.submittedAt ? ` on ${formatDateTime(instance.submittedAt)}` : ''}. {instance.approvalStage === 'HOD' ? 'With the department head now. After they approve, PC gives the final OK.' : instance.hodApprovedAt ? 'The department head approved it. Waiting for the final OK from PC.' : 'Waiting for approval from PC.'}
            </NoticeBanner>
          )}

          {instance.verificationStatus === 'NOT_SUBMITTED' && verificationNote && (
            <NoticeBanner tone="danger" icon={CornerUpLeft}>
              <span className="font-semibold">Taken back by the admin: </span>{verificationNote}
              <span className="block mt-0.5 text-text-secondary">Answer it again, then tap Submit.</span>
            </NoticeBanner>
          )}

          {instance.verificationStatus === 'APPROVED' && (
            <VerificationNoteBanner note={verificationNote} approved verifiedBy={instance.verifiedBy} />
          )}

          {instance.verificationStatus === 'REJECTED' && (
            <SendBackSummary instance={instance} now={now} showLockNote={!!sentBackId && canWork} onGoTo={goToItem} />
          )}
        </div>
      )}

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-start lg:gap-8">
        <div className="flex min-w-0 flex-col gap-3 lg:col-span-8">
          {instance.items.length === 0 && (
            <EmptyState
              icon={ListTodo}
              title="No questions in this checklist"
              description={isAdminOrPC ? 'Add questions to the template. New runs pick them up.' : 'There is nothing to fill in here. Ask your coordinator if that looks wrong.'}
              action={isAdminOrPC ? { label: 'Edit template', icon: Pencil, onClick: () => navigate(`/admin/scheduled-checklists/builder/${instance.definitionId}`) } : undefined}
            />
          )}

          {show === 'section' && activeSection && sections.length > 1 && (
            <div className={cn(PANEL_CLASS, 'flex items-center gap-2 p-2')}>
              <Button
                variant="outline"
                size="md"
                className="size-11 shrink-0 p-0"
                disabled={activeSectionIndex <= 0}
                onClick={() => pickSection(sections[activeSectionIndex - 1]!.key)}
                aria-label="Previous section"
              >
                <ChevronLeft size={18} aria-hidden />
              </Button>
              <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 text-center">
                <span className="t-meta font-display font-medium text-text-muted tabular-nums">Section {activeSectionIndex + 1} of {sections.length} · {activeSection.done}/{activeSection.total} done</span>
                <span className="t-card font-display font-bold text-text line-clamp-2 leading-snug break-words">{activeSection.label}</span>
              </div>
              <Button
                variant={activeSection.done === activeSection.total ? 'primary' : 'outline'}
                size="md"
                className="size-11 shrink-0 p-0"
                disabled={activeSectionIndex >= sections.length - 1}
                onClick={() => pickSection(sections[activeSectionIndex + 1]!.key)}
                aria-label="Next section"
              >
                <ChevronRight size={18} aria-hidden />
              </Button>
            </div>
          )}

          <CorrectionRoundContext.Provider value={sentBackAtOf(instance)}>
          <PhotoReviewContext.Provider value={canReview && instance.verificationStatus === 'PENDING_APPROVAL' ? { kind: 'run', ownerId: instanceId } : null}>
            <div className="flex flex-col gap-3">
              {show === 'left' && shownItems.length === 0 && (
                <div className={cn(PANEL_CLASS, 'flex items-center gap-3 p-4')}>
                  <CheckCheck className="size-5 text-success shrink-0" aria-hidden />
                  <p className="t-card font-display font-semibold text-text">Every question is answered.{canSubmit ? ' Submit it below.' : ''}</p>
                </div>
              )}
              {itemGroups.map((group, groupIndex) => {
                const key = group.section ?? '';
                const rows = group.items.map((item, idx) => (
                  <SmoothItem key={item.id} active={reorder || show === 'left'}>
                    <DetailItemRow
                      item={item}
                      instanceId={instanceId}
                      canWork={canWork}
                      isLocked={isLocked}
                      currentUserId={user?.id}
                      overdue={overdue}
                      showHeader={false}
                      inSectionBox={hasSections && !group.done}
                      isFirst={groupIndex === 0 && idx === 0}
                      selecting={canReview}
                      picked={draft.pickedSet.has(item.id)}
                      onTogglePicked={togglePick}
                      note={draft.picked[item.id] ?? ''}
                      onNoteChange={draft.setItemNote}
                      photoOnly={draft.photoOnlySet.has(item.id)}
                      onTogglePhotoOnly={draft.togglePhotoOnly}
                      canWaive={canWaive}
                      canRaiseTicket={canReview}
                    />
                  </SmoothItem>
                ));
                if (group.done) {
                  return (
                    <CompletedGroup
                      key="completed"
                      id={DONE_GROUP_ID}
                      count={group.items.length}
                      total={total}
                      hint="Answered questions move here"
                      open={doneOpen}
                      onToggle={() => setDoneOpen((v) => !v)}
                      bodyClassName="flex flex-col gap-3"
                    >
                      {rows}
                    </CompletedGroup>
                  );
                }
                if (!hasSections) return <Fragment key="all">{rows}</Fragment>;
                const counts = sectionCounts.get(key);
                const finished = !!counts && counts.done === counts.total;
                const collapsed = isCollapsed(key, group.items);
                const inactive = show === 'section' && key !== activeSectionKey;
                const bodyId = `section-body-${key || 'none'}-${groupIndex}`;
                return (
                  <section
                    key={`${key || 'none'}-${groupIndex}`}
                    id={groupIndex === itemGroups.findIndex((g) => !g.done && (g.section ?? '') === key) ? `section-${key || 'none'}` : undefined}
                    aria-label={group.section ?? 'Other questions'}
                    className={cn('flex scroll-mt-4 flex-col rounded-xl border border-border/70 bg-transparent p-3 sm:p-4', inactive && 'hidden')}
                  >
                    <header className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="min-w-0 break-words t-section font-display font-bold text-text">{group.section ?? 'Other questions'}</h2>
                        <div className="flex shrink-0 items-center gap-2">
                          {counts && (
                            <span className={cn('rounded-full px-2.5 py-0.5 t-meta font-display font-semibold tabular-nums ring-1 ring-inset', finished ? 'bg-success/10 text-success-strong ring-success/30 dark:text-success' : 'bg-surface text-text-secondary ring-border/60')}>
                              {counts.done} of {counts.total}
                            </span>
                          )}
                          {show === 'all' && finished && !canReview && (
                            <button
                              type="button"
                              onClick={() => toggleSection(key)}
                              aria-expanded={!collapsed}
                              aria-controls={bodyId}
                              aria-label={collapsed ? `Show ${group.section ?? 'other questions'}` : `Hide ${group.section ?? 'other questions'}`}
                              className="flex size-9 pointer-coarse:size-11 items-center justify-center rounded-lg text-text-muted outline-none transition-colors duration-150 ease-out hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer"
                            >
                              <ChevronDown size={16} aria-hidden className={cn('transition-transform duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]', collapsed ? '' : 'rotate-180')} />
                            </button>
                          )}
                        </div>
                      </div>
                      {counts && counts.total > 0 && <ChecklistProgressBar done={counts.done} total={counts.total} tone="auto" bare thin />}
                    </header>
                    <Collapse id={bodyId} open={!collapsed} innerClassName="flex flex-col gap-3 pt-3">
                      {rows}
                    </Collapse>
                  </section>
                );
              })}
            </div>
          </PhotoReviewContext.Provider>
          </CorrectionRoundContext.Provider>

          {show === 'section' && activeSection && activeSection.done === activeSection.total && activeSectionIndex < sections.length - 1 && (
            <Button variant="primary" size="md" className="h-11 self-end font-display" onClick={() => pickSection(sections[activeSectionIndex + 1]!.key)}>
              Next section
              <ChevronRight size={15} aria-hidden />
            </Button>
          )}

          {show === 'one' && instance.items.length > 1 && (
            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" size="md" disabled={currentIndex <= 0} onClick={() => setOneIndex(currentIndex - 1)} className="pointer-coarse:h-11">
                <ArrowLeft size={15} aria-hidden />
                Back
              </Button>
              <span className="t-meta font-display font-semibold tabular-nums text-text-secondary">Question {currentIndex + 1} of {instance.items.length}</span>
              <Button variant="primary" size="md" disabled={currentIndex >= lastIndex} onClick={() => setOneIndex(currentIndex + 1)} className="pointer-coarse:h-11">
                Next
                <ArrowDown size={15} className="-rotate-90" aria-hidden />
              </Button>
            </div>
          )}

          {filling && (
            <FillBottomBar
              progress={fillProgress}
              canSubmit={canSubmit}
              resubmit={resubmit}
              submit={submit}
              onNext={left > 0 ? goToNext : undefined}
              late={lateChip}
            />
          )}

          {canReview && (
            <ChecklistReviewBar instance={instance} draft={draft} onDecided={goBackAfterDecision} />
          )}
        </div>

        {(filling || canReview) && (
          <FillAside
            title={canReview ? 'Review summary' : 'Your progress'}
            progress={fillProgress}
            completion={progress}
            isComplete={isComplete}
            compliance={compliance}
            good={good}
            scored={scored}
            sections={sections}
            activeSection={show === 'section' ? activeSectionKey : null}
            onPickSection={pickSection}
            late={lateChip}
            canSubmit={canSubmit && !canReview}
            resubmit={resubmit}
            submit={submit}
            onNext={filling && left > 0 ? goToNext : undefined}
          />
        )}
      </div>
    </div>
  );
};
