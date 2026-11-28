import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { haptic } from '../../../lib/haptics';
import { useRefreshOnNewDay } from '../useRefreshOnNewDay';
import { useParams, useNavigate } from 'react-router';
import { useGoBack } from '../../../lib/historyBack';
import { ArrowDown, ArrowLeft, CheckCheck, ShieldCheck, ShieldQuestion, CornerUpLeft, Pencil, Clock, ClipboardX, ListTodo, Eye } from 'lucide-react';
import { PeriodTabControl } from '../../dashboard/PeriodTabControl';
import { useMyExtraWorkingDaysQuery } from '../../admin/holidays/hook';
import { cn } from '@/lib/utils';
import {
  Button, ChecklistProgressBar, EmptyState, IconChip, InlineError, NoticeBanner, PANEL_CLASS, Skeleton, StatusChip, VerificationNoteBanner, ActionLabel, ApprovalStatusChip, VerifiedByChip, VerifiedAtChip, } from '../../../components';
import { useChecklistInstanceQuery } from '../hook';
import { useReviewDraft } from '../../verification/useReviewDraft';
import { pickDefaults, runCorrectionItems } from '../../verification/correctionItems';
import { canCompleteAllRun, canSelfCompleteAllRun, canWaiveRun } from './canWaive';
import { answerRightsOf } from './answerRights';
import { AuditScorePanel } from './AuditScorePanel';
import { isPointsScored } from '../pointsScore';
import { ReviewEditsProvider } from './ReviewEditsProvider';
import { ReviewEditBar } from './ReviewEditBar';
import { CompleteAllAction } from './CompleteAllAction';
import { SelfCompleteAllAction } from './SelfCompleteAllAction';
import { useMyProfileQuery } from '../../settings/hook';
import { ApiError } from '../../../api/http';
import { ChecklistReviewBar } from './ChecklistReviewBar';
import { SendBackSummary } from './SendBackSummary';
import { CorrectionRoundContext, sentBackAtOf } from './correctionRound';
import { PhotoReviewContext } from './photoReviewContext';
import { DetailItemRow } from './ChecklistDetailItemRow';
import {
  complianceToneClass, describeInstanceEnd, dueTooltip, formatDateTime, getInstanceView, instanceClosing, instanceProgressToneClass, isInstanceEnded, instanceOpensOnLaterDay, isInstanceInLateWindow, isInstanceNotYetOpen,
  RECURRENCE_LABEL, formatPeriodSpan, displayTitle } from '../checklistDisplay';
import { useNow } from '../../../lib/useNow';
import { useDoneLast } from '../../../lib/useDoneLast';
import { useRowActivity } from '../../../lib/useRowActivity';
import { SmoothItem } from '../../../components/smoothItem';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';
import { LateCountdownChip, LateWindowBanner } from './LateWindowBanner';
import { useAuth } from '../../../context/AuthContext';
import { useSubmitRun } from './fill/useSubmitRun';
import { FillBottomBar } from './fill/FillBottomBar';
import { FillAside } from './fill/FillAside';
import { auditPeopleProgress, photosMissingOf, type FillProgress } from './fill/fillProgress';

const NO_ITEMS: ChecklistInstanceItem[] = [];

type ShowMode = 'all' | 'left' | 'one';
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

const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? name;

const namesLine = (names: string[] | undefined, firstNameOnly = false) => {
  if (!names?.length) return null;
  const list = firstNameOnly ? names.map(firstNameOf) : names;
  return list.length <= 2 ? list.join(' and ') : `${list[0]}, ${list[1]} and ${list.length - 2} more`;
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
  const { data: instance, isPending, isError, error, refetch } = useChecklistInstanceQuery(instanceId);
  const draft = useReviewDraft(instanceId || null);
  const submitSummary = useCallback(() => {
    const items = instance?.items ?? [];
    const na = items.filter((i) => i.isNotApplicable).length;
    const answered = items.length - na;
    return {
      title: `Submit "${instance?.title ?? 'this checklist'}"?`,
      description: `${answered} ${answered === 1 ? 'question' : 'questions'} answered${na ? `, ${na} not applicable` : ''}. It goes to your department head first, then PC. You have 30 minutes to take it back yourself if you spot a mistake.`,
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
      toast.success('Sent for approval. You have 30 minutes to take it back from the Preview on the list.');
    }
  }, [status, instance?.submittedBy, user?.id]);
  const { data: myExtraDays } = useMyExtraWorkingDaysQuery();
  const { data: myProfile } = useMyProfileQuery();
  const [pickedShow, setShow] = useState<ShowMode | null>(null);
  const [oneIndex, setOneIndex] = useState(0);
  const [editAnswers, setEditAnswers] = useState(false);
  const goBackAfterDecision = useGoBack(user?.role === 'ADMIN' || user?.role === 'PC' ? '/verify' : '/checklists/approvals', { replace: true });
  const goBackToList = useGoBack('/checklists', { replace: true });

  const rowIsBusy = useRowActivity(rowDomId);
  const { settling } = useDoneLast(instance?.items ?? NO_ITEMS, isAnswered, rowIsBusy);

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

  const { done, total, progress, isComplete, overdue, chipStatus, compliance, scored, good, verification, doneLate } = getInstanceView(instance, now);
  const labels = instance as typeof instance & RunLabels;
  const isMine = !!user && instance.assigneeIds.includes(user.id);
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
  const rights = answerRightsOf(user?.role);
  const canWork = canWorkRaw && (rights.liveWhileReviewing || !canReview || editAnswers);
  // An approved run is locked for everyone the server locks it for, which is everyone but an admin.
  const answersLocked = isLocked && !rights.whenApproved;
  const notYetOpen = isInstanceNotYetOpen(instance);
  const photosMissing = photosMissingOf(instance.items);
  const canSubmit =
    !!user && (user.role === 'ADMIN' || instance.assigneeIds.includes(user.id)) && canWork && isComplete && !notYetOpen &&
    (instance.verificationStatus === 'NOT_SUBMITTED' || instance.verificationStatus === 'REJECTED') &&
    photosMissing.count === 0;
  const resubmit = instance.verificationStatus === 'REJECTED';
  const overtime = (myExtraDays ?? []).find((d) => d.date === instance.periodStart.slice(0, 10));
  const answered = (i: (typeof instance.items)[number]) => i.isDone || i.isNotApplicable;
  const left = Math.max(0, total - done);
  const showCompleteAll = left > 0 && !notYetOpen && canCompleteAllRun(user, instance, myProfile?.canCompleteAll === true);
  const showSelfCompleteAll = left > 0 && !notYetOpen && canWork && !canReview && canSelfCompleteAllRun(user, instance);
  const fillProgress: FillProgress = { done, total, left, overdue, people: auditPeopleProgress(instance.items), photosMissing };
  const filling = canWork && !answersLocked && total > 0 && !canReview;
  const show: ShowMode = canReview ? 'all' : pickedShow ?? 'all';
  const lastIndex = Math.max(0, instance.items.length - 1);
  const currentIndex = Math.min(oneIndex, lastIndex);
  const shownItems = show === 'left'
    ? instance.items.filter((i) => !answered(i))
    : show === 'one'
      ? instance.items.slice(currentIndex, currentIndex + 1)
      : instance.items;
  const goToItem = (target: ChecklistInstanceItem) => {
    const move = () => requestAnimationFrame(() => focusRow(target.id));
    if (show === 'one') {
      setOneIndex(instance.items.indexOf(target));
      requestAnimationFrame(move);
      return;
    }
    const switching = show === 'left' && !shownItems.includes(target);
    if (switching) setShow('all');
    if (settling.size > 0) window.setTimeout(move, SETTLE_AND_MOVE_MS);
    else if (switching) requestAnimationFrame(move);
    else move();
  };
  const goToNext = () => {
    const next = instance.items.find((i) => !answered(i));
    if (next) goToItem(next);
  };
  const goToPhoto = (id: string) => {
    const target = instance.items.find((i) => i.id === id);
    if (target) goToItem(target);
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
  const metaParts = isMine
    ? [namesLine(labels.assigneeNames, true)].filter(Boolean)
    : [
        labels.storeName,
        namesLine(labels.assigneeNames),
        `${RECURRENCE_LABEL[instance.recurrence]}, ${formatPeriodSpan(instance)}`,
      ].filter(Boolean);
  const modeOptions = ['all', 'left', 'one'] as const;
  const changeShow = (next: ShowMode) => {
    if (next === 'one') setOneIndex(Math.max(0, instance.items.findIndex((i) => !answered(i))));
    setShow(next);
  };
  const lateChip = inLateWindow ? <LateCountdownChip instance={instance} now={now} /> : null;

  return (
    <ReviewEditsProvider
      instanceId={instanceId}
      items={instance.items}
      enabled={rights.liveWhileReviewing && canReview && canWorkRaw}
      canUnanswer={rights.unanswer}
    >
    <div className="flex flex-col gap-6 w-full">
      <div className={'flex items-center justify-between gap-3 max-md:hidden'}>
        <Button variant="ghost" size="sm" className="max-md:hidden" onClick={goBackToList} aria-label="Back">
          <ArrowLeft size={15} aria-hidden />
          Back
        </Button>

      </div>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-start lg:gap-8">
        <div className="flex min-w-0 flex-col gap-3 lg:col-span-8">
      {/* Frozen while the questions scroll beneath it. The card is opaque, so the questions do not show through. */}
      <div className={cn(PANEL_CLASS, 'sticky top-0 z-20 flex flex-col gap-3 p-3.5 sm:p-5')}>
        {/* Editing the template sits in the flow of the page. It used to be a floating button,
            which on a phone covered the N/A control on whichever question it landed over. */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="t-title font-display font-bold leading-snug text-text break-words">{displayTitle(instance.title)}</h1>
            <p className="t-meta font-display text-text-muted line-clamp-2">{metaParts.join(' · ')}</p>
          </div>
          {isAdminOrPC && (
            <Button
              variant="outline"
              size="sm"
              className="h-11 min-w-11 shrink-0 justify-center md:h-9 md:min-w-0"
              onClick={() => navigate(`/admin/scheduled-checklists/builder/${instance.definitionId}`)}
              aria-label="Edit this checklist's template"
              title="Edit this checklist's template. Changes apply to future runs, not this one."
            >
              <Pencil size={13} aria-hidden />
              <ActionLabel>Edit template</ActionLabel>
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusChip status={chipStatus} title={dueTooltip(instance, chipStatus, now)} iconOnlyOnMobile />
          {doneLate && <IconChip icon={Clock} tone="bg-warning" label="Done late" iconOnlyOnMobile />}
          {overtime && <IconChip icon={Clock} tone="bg-warning" label={`Overtime: ${overtime.reason}`} iconOnlyOnMobile />}
          {(isComplete || instance.verificationStatus !== 'NOT_SUBMITTED') && (
            <ApprovalStatusChip
              status={
                isComplete && (instance.verificationStatus === 'NOT_SUBMITTED' || instance.verificationStatus === 'REJECTED')
                  ? 'READY_TO_SUBMIT'
                  : instance.verificationStatus
              }
              label={verification.label}
              compactOnMobile
            />
          )}
          {isLocked && instance.verifiedBy && (
            <VerifiedByChip verifierName={instance.verifiedByName ?? null} compactOnMobile />
          )}
          {isLocked && instance.verifiedAt && isAdminOrPC && (
            <VerifiedAtChip timestamp={instance.verifiedAt} />
          )}
          {instance.submittedAt && instance.verificationStatus !== 'NOT_SUBMITTED' && instance.verificationStatus !== 'REJECTED' && !instance.verifiedAt && (
            <span className="hidden t-meta font-medium text-text-muted sm:inline">
              Submitted{isAdminOrPC ? ` ${formatDateTime(instance.submittedAt)}` : ''}{instance.submittedByName ? ` by ${instance.submittedByName}` : ''}
            </span>
          )}
        </div>

        <div className={cn('grid grid-cols-2 gap-2 tabular-nums sm:hidden', compliance === null && 'grid-cols-1')}>
          <span className="flex min-w-0 items-center gap-1.5 rounded-lg border border-border/60 bg-surface px-2.5 py-2">
            <CheckCheck className="size-3.5 shrink-0 text-text-muted" aria-hidden />
            <span className={cn('t-stat font-display font-bold leading-none', instanceProgressToneClass(overdue, isComplete))}>{progress}%</span>
            <span className="t-meta text-text-muted truncate">{done}/{total}</span>
          </span>
          {compliance !== null && (
            <span className="flex min-w-0 items-center gap-1.5 rounded-lg border border-border/60 bg-surface px-2.5 py-2">
              <ShieldCheck className="size-3.5 shrink-0 text-text-muted" aria-hidden />
              <span className={cn('t-stat font-display font-bold leading-none', complianceToneClass(compliance))}>{compliance}%</span>
              <span className="t-meta text-text-muted truncate">{good}/{scored}</span>
            </span>
          )}
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
            <span className="t-meta font-display font-semibold text-text-muted max-sm:sr-only">Show</span>
            <PeriodTabControl
              value={show}
              options={modeOptions}
              labels={{ all: 'All', left: `Left ${left}`, one: 'One by one' }}
              onChange={changeShow}
              className="w-full sm:w-fit"
            />
          </div>
        )}

        {isPointsScored(instance) && (
          <AuditScorePanel items={instance.items} className="border-t border-border/60 pt-3" />
        )}

        {canReview && canWorkRaw && (
          rights.liveWhileReviewing ? (
            <ReviewEditBar locked={answersLocked} />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
              <p className="t-meta font-display text-text-muted">
                {editAnswers ? 'You are changing the answers. Changes save straight away.' : 'Answers are read-only while you review.'}
              </p>
              <Button variant="outline" size="sm" className="pointer-coarse:h-11" onClick={() => setEditAnswers((v) => !v)} aria-pressed={editAnswers}>
                {editAnswers ? <Eye size={13} aria-hidden /> : <Pencil size={13} aria-hidden />}
                {editAnswers ? 'Done editing' : 'Edit answers'}
              </Button>
            </div>
          )
        )}

        {showCompleteAll && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
            <p className="t-meta font-display text-text-muted">
              {left} {left === 1 ? 'question is' : 'questions are'} still open.
            </p>
            <CompleteAllAction instanceId={instance.id} openCount={left} />
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
              Submitted{instance.submittedByName ? ` by ${instance.submittedByName}` : ''}{isAdminOrPC && instance.submittedAt ? ` on ${formatDateTime(instance.submittedAt)}` : ''}. {instance.approvalStage === 'HOD' ? 'With the department head now. After they approve, PC gives the final OK.' : instance.hodApprovedAt ? 'The department head approved it. Waiting for the final OK from PC.' : 'Waiting for approval from PC.'}
            </NoticeBanner>
          )}

          {instance.verificationStatus === 'NOT_SUBMITTED' && verificationNote && (
            <NoticeBanner tone="danger" icon={CornerUpLeft}>
              <span className="font-semibold">Taken back by the admin: </span>{verificationNote}
              <span className="block mt-0.5 text-text-secondary">Answer it again, then tap Submit.</span>
            </NoticeBanner>
          )}

          {instance.verificationStatus === 'APPROVED' && (
            <VerificationNoteBanner note={verificationNote} approved verifiedBy={instance.verifiedByName ?? null} verifiedAt={isAdminOrPC ? instance.verifiedAt : null} />
          )}

          {instance.verificationStatus === 'REJECTED' && (
            <SendBackSummary instance={instance} now={now} showLockNote={!!sentBackId && canWork} onGoTo={goToItem} />
          )}
        </div>
      )}

          {instance.items.length === 0 && (
            <EmptyState
              icon={ListTodo}
              title="No questions in this checklist"
              description={isAdminOrPC ? 'Add questions to the template. New runs pick them up.' : 'There is nothing to fill in here. Ask your coordinator if that looks wrong.'}
              action={isAdminOrPC ? { label: 'Edit template', icon: Pencil, onClick: () => navigate(`/admin/scheduled-checklists/builder/${instance.definitionId}`) } : undefined}
            />
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
              {shownItems.map((item) => (
                <SmoothItem key={item.id} active={show === 'left'}>
                  <DetailItemRow
                    item={item}
                    number={instance.items.indexOf(item) + 1}
                    instanceId={instanceId}
                    canWork={canWork}
                    isLocked={answersLocked}
                    currentUserId={user?.id}
                    overdue={overdue}
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
              ))}
            </div>
          </PhotoReviewContext.Provider>
          </CorrectionRoundContext.Provider>

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
              onGoToPhoto={goToPhoto}
              late={lateChip}
              selfCompleteAll={showSelfCompleteAll ? <SelfCompleteAllAction instanceId={instance.id} openCount={left} onDone={goBackToList} /> : undefined}
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
            late={lateChip}
            canSubmit={canSubmit && !canReview}
            resubmit={resubmit}
            submit={submit}
            onNext={filling && left > 0 ? goToNext : undefined}
            onGoToPhoto={goToPhoto}
            selfCompleteAll={showSelfCompleteAll ? <SelfCompleteAllAction instanceId={instance.id} openCount={left} onDone={goBackToList} /> : undefined}
          />
        )}
      </div>
    </div>
    </ReviewEditsProvider>
  );
};
