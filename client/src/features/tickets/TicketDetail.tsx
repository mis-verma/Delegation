import { useRef, useState } from 'react';
import { AlarmClock, RotateCcw, ShieldCheck, Flag, Building2, CalendarDays, User, Store as StoreIcon, Layers, ChevronDown, AlertCircle, Ban } from 'lucide-react';
import {
  useStoresQuery,
  useTicketQuery,
  useUpdateTicketMutation,
  useDeleteTicketMutation,
  useAssignableUsersQuery,
  useVerifyTicketMutation,
  useAddTicketStatusUpdateMutation,
  useDepartmentsQuery,
  useDeclineTicketMutation,
  useApproveAssignmentMutation,
  useReopenDeclinedMutation,
} from './hook';
import { Button, IconChip, ImageLightbox, PriorityChip } from '../../components';
import { DeclineTicketDialog } from './detail/DeclineTicketDialog';
import { HeadDecisionPanel } from './detail/HeadDecisionPanel';
import { HeadApprovedBanner } from './detail/HeadApprovedBanner';
import { ProgressUpdatesPanel } from './detail/ProgressUpdatesPanel';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useCategoriesQuery } from '../settings/hook';
import { DetailLabelsField } from '../tags/DetailLabelsField';
import { useAuth } from '../../context/AuthContext';
import { OWN_SCOPE_ROLES } from '../../api/auth';
import { getTicketStatusLabel } from '../../lib/ticketStatusLabel';
import { getInitials } from '../../lib/getInitials';
import { avatarColorClass } from '../../lib/avatarColors';
import { errorMessage } from '../../lib/queryHelpers';
import { STATUS_OPTIONS, STATUS_UPDATE_OPTIONS, HAND_IN_LABEL } from './detail/detailConstants';
import { PRIORITY_CONFIG, formatDueLabel } from './ticketDisplay';
import { TicketDetailHeader } from './detail/TicketDetailHeader';
import { TicketPropertyRow } from './detail/TicketPropertyRow';
import { PROPERTY_TRIGGER_CLASS, dueTone } from './detail/propertyStyles';
import { TicketPriorityChipPicker } from './form/TicketPriorityChipPicker';
import { VerificationNoteBanner } from '../../components/verificationBanner';
import { TicketDescription } from './detail/TicketDescription';
import { TicketAttachments } from './detail/TicketAttachments';
import { TicketEditForm } from './detail/TicketEditForm';
import { canChangeTicket, canWithdrawTicket } from './ticketPermissions';
import { TicketStatusHistory } from './detail/TicketStatusHistory';
import { TicketActivitySheet } from './detail/TicketActivitySheet';
import { TicketVerificationActions } from './detail/TicketVerificationActions';
import { TicketStatusMenu } from './detail/TicketStatusMenu';
import { TicketStatusRemarkDialog } from './TicketStatusRemarkDialog';
import { ChecklistPanel } from './ChecklistPanel';
import { useConfirm } from '@/components/confirmDialog';
import type { AssignableUser } from '../../api/users';
import type { Role } from '../../api/auth';
import { AssigneeField } from '../assignees/AssigneeField';
import { DETAIL_HEADING_CLASS } from '../tasks/taskFormFieldStyles';
import { RESTRICTED_STATUSES, type Ticket, type TicketAttachment, type TicketStatus, type RestrictedStatus, type CaptureMethod } from '../../api/ticket';
import { canApproveTicket, isFinalApproval } from '../../lib/ticketApproval';
import { TicketApprovalTrail } from './detail/TicketApprovalTrail';
import { ticketScore } from '../../lib/itemScore';
import { ItemScoreCard } from '../../components/itemScoreCard/ItemScoreCard';

interface TicketDetailProps {
  ticket: Ticket;
  onClose: () => void;
}

const EDIT_FORM_ID = 'ticket-edit-form';

const formatRaised = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const day = d.toLocaleDateString(undefined, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  return `${day}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};
const ROUTING_ROLES: readonly Role[] = ['ADMIN', 'PC', 'MANAGER', 'SENIOR'];

export const TicketDetail = ({ ticket: initialTicket, onClose }: TicketDetailProps) => {
  const { data: fresh, isPending } = useTicketQuery(initialTicket.id);
  const ticket = fresh ?? initialTicket;

  const { user: currentUser } = useAuth();
  const role = currentUser?.role;
  const isAdmin = role === 'ADMIN' || role === 'PC';
  const isVerifier = isAdmin;
  const ownScope = !!role && OWN_SCOPE_ROLES.includes(role);
  const canChangeStatus = canChangeTicket(currentUser, ticket);
  const canEdit = canChangeStatus && ticket.status !== 'CLOSED';
  const canRoute = canEdit && !!role && ROUTING_ROLES.includes(role);
  const canWithdraw = !!fresh && canWithdrawTicket(currentUser, ticket);
  const canRemovePhoto = (a: TicketAttachment) =>
    role === 'ADMIN' || (canEdit && !a.statusUpdateId);

  const updateMut = useUpdateTicketMutation();
  const editMut = useUpdateTicketMutation({ inlineError: true });
  const labelsMut = useUpdateTicketMutation({ silent: true });
  const deleteMut = useDeleteTicketMutation({ withdraw: !isAdmin });
  const verifyMut = useVerifyTicketMutation();
  const declineMut = useDeclineTicketMutation();
  const approveAssignmentMut = useApproveAssignmentMutation();
  const reopenMut = useReopenDeclinedMutation();
  const [declining, setDeclining] = useState(false);

  const { data: assignableUsers } = useAssignableUsersQuery(ticket.departmentId ?? undefined);
  const { data: departments } = useDepartmentsQuery();
  const assigneeOptions: AssignableUser[] | undefined = ticket.assignee && assignableUsers && !assignableUsers.some(u => u.id === ticket.assignee!.id)
    ? [...assignableUsers, { id: ticket.assignee.id, firstName: ticket.assignee.firstName, lastName: null, email: ticket.assignee.email, role: ticket.assignee.role as Role, departmentId: null }]
    : assignableUsers;
  const departmentName = ticket.departmentId ? departments?.find(d => d.id === ticket.departmentId)?.name : undefined;
  const { data: stores } = useStoresQuery();
  const { data: categories } = useCategoriesQuery();
  const storeName = ticket.storeId ? stores?.find(s => s.id === ticket.storeId)?.name : undefined;
  const categoryName = ticket.categoryId ? categories?.find(c => c.id === ticket.categoryId)?.name : undefined;
  const raisedByUser = assignableUsers?.find(u => u.id === ticket.userId);
  const raisedByName = ticket.userId === currentUser?.id
    ? 'You'
    : raisedByUser ? `${raisedByUser.firstName} ${raisedByUser.lastName ?? ''}`.trim() : null;

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [editDirty, setEditDirty] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const statusUpdateMut = useAddTicketStatusUpdateMutation(ticket.id);

  const confirm = useConfirm();
  const confirmDiscard = () => confirm({
    title: 'Discard changes?',
    description: 'Your edits to this ticket will be lost.',
    confirmLabel: 'Discard',
    cancelLabel: 'Keep editing',
    variant: 'danger',
  });

  const requestClose = () => {
    if (!(editing && editDirty)) {
      onClose();
      return true;
    }
    return confirmDiscard().then((ok) => {
      if (ok) onClose();
      return ok;
    });
  };

  const startEditing = () => {
    editMut.reset();
    setEditDirty(false);
    setEditing(true);
  };
  const cancelEditing = async () => {
    if (editDirty && !(await confirmDiscard())) return;
    setEditing(false);
    setEditDirty(false);
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete this ticket?',
      description: `"${ticket.title}" will be removed from every list for everyone working on it. An admin can still see it in the audit history.`,
      confirmLabel: 'Delete ticket',
      cancelLabel: 'Keep it',
      variant: 'danger',
    });
    if (!ok) return;
    deleteMut.mutate(ticket.id, { onSuccess: onClose });
  };

  const handleWithdraw = async () => {
    const ok = await confirm({
      title: 'Withdraw this ticket?',
      description: `"${ticket.title}" will be taken off every list. Nobody has started on it yet, so nothing is lost. If you still need it later, raise it again.`,
      confirmLabel: 'Withdraw ticket',
      cancelLabel: 'Keep it',
      variant: 'danger',
    });
    if (!ok) return;
    deleteMut.mutate(ticket.id, { onSuccess: onClose });
  };

  const due = formatDueLabel(ticket);

  const [quickStatusPick, setQuickStatusPick] = useState<RestrictedStatus | null>(null);
  const [quickStatusPhotos, setQuickStatusPhotos] = useState<File[]>([]);
  const [quickStatusCaptureMethod, setQuickStatusCaptureMethod] = useState<CaptureMethod>('GALLERY');

  const addQuickStatusPhotos = (files: FileList | null, method: CaptureMethod) => {
    if (!files || !files.length) return;
    setQuickStatusPhotos(prev => [...prev, ...Array.from(files)]);
    setQuickStatusCaptureMethod(method);
  };

  const showVerify = ticket.status === 'PENDING_APPROVAL' && canApproveTicket(currentUser, ticket);
  const awaitingHead = !!ticket.awaitingHeadApproval && !ticket.declinedAt;
  const workerCanMove = canChangeStatus
    && !awaitingHead
    && ticket.status !== 'CLOSED'
    && ticket.status !== 'PENDING_APPROVAL'
    && (!ownScope || ticket.assigneeId === currentUser?.id);
  const statusOptions = showVerify || awaitingHead || !!ticket.declinedAt
    ? []
    : (isVerifier ? STATUS_OPTIONS : workerCanMove ? STATUS_UPDATE_OPTIONS : [])
      .filter(s => s.value !== ticket.status && s.value !== 'CLOSED')
      .map(s => (s.value === 'PENDING_APPROVAL' ? { ...s, label: HAND_IN_LABEL } : s));

  const handlePickStatus = (next: TicketStatus) => {
    if (next === 'ON_HOLD' || next === 'PENDING_APPROVAL') setQuickStatusPick(next);
    else if ((RESTRICTED_STATUSES as readonly string[]).includes(next)) statusUpdateMut.mutate({ status: next as RestrictedStatus });
    else updateMut.mutate({ id: ticket.id, payload: { status: next } });
  };

  const statusLabel = ticket.declinedAt ? 'Declined' : getTicketStatusLabel(ticket.status);
  const assigneeName = ticket.assignee?.firstName ?? null;
  const isDepartmentHead = (role === 'MANAGER' || role === 'SENIOR') && !!currentUser?.departmentId && currentUser.departmentId === ticket.departmentId;
  const canDecline = !ticket.declinedAt
    && !awaitingHead
    && (ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS' || ticket.status === 'ON_HOLD')
    && (isAdmin || (isDepartmentHead && ticket.userId !== currentUser?.id));
  const canApproveAssignment = awaitingHead && (isAdmin || isDepartmentHead);
  const canReopenDeclined = !!ticket.declinedAt && (isAdmin || isDepartmentHead);
  const showFooter = editing || showVerify || statusOptions.length > 0 || canWithdraw || canDecline || canReopenDeclined;
  const showLoadingBar = isPending && initialTicket.statusUpdates === undefined;

  return (
    <Sheet open onOpenChange={v => { if (!v) return requestClose(); }}>
     
      <SheetContent
        showCloseButton={false}
        onInteractOutside={(e) => { if (editing && editDirty) e.preventDefault(); }}
        ref={sheetRef}
        onOpenAutoFocus={(e) => { e.preventDefault(); sheetRef.current?.focus({ preventScroll: true }); }}
        className="w-full sm:max-w-[600px] md:max-w-[680px] lg:max-w-[880px] xl:max-w-[1040px] p-0 flex flex-col h-full overflow-hidden font-sans shadow-none"
      >
        {showLoadingBar && (
          <div className="absolute top-0 left-0 right-0 z-50 h-[3px] w-full bg-primary-500/15 overflow-hidden" aria-hidden>
            <div className="h-full bg-primary-500 w-1/2 rounded-r-full animate-[slide_1.5s_ease-in-out_infinite]" />
          </div>
        )}

        <TicketDetailHeader
          ticket={ticket}
          statusLabel={statusLabel}
          raisedByName={raisedByName}
          onEdit={canEdit && !editing ? startEditing : undefined}
          onShowActivity={() => setActivityOpen(true)}
          onDelete={isAdmin ? handleDelete : undefined}
          isDeleting={deleteMut.isPending}
        />

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-1 pb-4 sm:px-6 sm:pt-1.5 sm:pb-5 lg:px-8 lg:pt-2 lg:pb-6 custom-scrollbar">
      
          <div className="flex flex-col gap-4 sm:gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-x-8">
            <aside
              aria-label="Ticket properties"
              className="flex flex-col gap-4 min-w-0 max-lg:order-2 max-lg:rounded-xl max-lg:border max-lg:border-border/60 max-lg:bg-surface-hover/30 max-lg:p-3 sm:max-lg:p-4 lg:order-2 lg:sticky lg:top-0 lg:rounded-xl lg:border lg:border-border lg:bg-surface lg:p-5"
            >
              
              <section className="flex flex-col gap-2 lg:gap-3">
                <dl className="grid grid-cols-2 gap-2 lg:flex lg:flex-col lg:gap-0 lg:divide-y lg:divide-border/60">
                  <TicketPropertyRow label="Priority" wide icon={Flag} tone={PRIORITY_CONFIG[ticket.priority].solid}>
                    {canEdit && !ownScope ? (
                      <TicketPriorityChipPicker
                        value={ticket.priority}
                        onChange={(priority) => updateMut.mutate({ id: ticket.id, payload: { priority } })}
                        fullWidth
                        triggerClassName={PROPERTY_TRIGGER_CLASS}
                      />
                    ) : (
                      <PriorityChip meta={PRIORITY_CONFIG[ticket.priority]} />
                    )}
                  </TicketPropertyRow>

                  {departmentName && (
                    <TicketPropertyRow label="Department" wide phoneHidden={!moreOpen}>
                      <IconChip icon={Building2} tone="bg-linear-to-br from-coral-500 to-coral-600" label={departmentName} className="h-8 sm:h-8 pr-3" labelClassName="text-sm" />
                    </TicketPropertyRow>
                  )}

                  {storeName && (
                    <TicketPropertyRow label="Store" wide phoneHidden={!moreOpen}>
                      <IconChip icon={StoreIcon} tone="bg-linear-to-br from-info to-info/70" label={storeName} className="h-8 sm:h-8 pr-3" labelClassName="text-sm" />
                    </TicketPropertyRow>
                  )}

                  {categoryName && (
                    <TicketPropertyRow label="Category" wide phoneHidden={!moreOpen}>
                      <IconChip icon={Layers} tone="bg-linear-to-br from-success to-success/70" label={categoryName} className="h-8 sm:h-8 pr-3" labelClassName="text-sm" />
                    </TicketPropertyRow>
                  )}

                  <TicketPropertyRow label="Assignee" icon={User} tone="bg-linear-to-br from-primary-500 to-primary-600" wide first>
                    {canRoute ? (
                      <div title="Assignee" className="w-full min-w-0">
                        <AssigneeField
                          single
                          hideLabel
                          selectedIds={ticket.assigneeId ? [ticket.assigneeId] : []}
                          onChange={ids => updateMut.mutate({ id: ticket.id, payload: { assigneeId: ids[0] ?? null } })}
                          users={assigneeOptions}
                        />
                      </div>
                    ) : (
                      <span title="Assignee" className="flex w-full min-w-0 items-center gap-2 h-10 pl-1.5 pr-2.5 rounded-lg border border-border/60 bg-surface t-meta font-display font-semibold text-text">
                        {assigneeName ? (
                          <span className={`flex items-center justify-center size-7 rounded-full text-white t-meta font-bold shrink-0 ${avatarColorClass(assigneeName)}`}>
                            {getInitials(assigneeName)}
                          </span>
                        ) : (
                          <span className="flex items-center justify-center size-7 rounded-full bg-surface-hover text-text-light shrink-0">
                            <User size={13} />
                          </span>
                        )}
                        <span className={`truncate ${assigneeName ? '' : 'text-text-muted'}`}>{assigneeName ?? 'Nobody yet'}</span>
                      </span>
                    )}
                  </TicketPropertyRow>

                  {due ? (
                    <TicketPropertyRow label="Due" wide>
                      <IconChip
                        icon={due.overdue ? AlarmClock : CalendarDays}
                        tone={dueTone(due.overdue)}
                        label={due.text.replace(/^Due\s+/i, '').replace(/^./, (c) => c.toUpperCase())}
                        className={`h-8 sm:h-8 pr-3 ${due.overdue ? 'border-danger/30 bg-danger/10' : ''}`}
                        labelClassName={`text-sm ${due.overdue ? 'text-danger' : ''}`}
                      />
                    </TicketPropertyRow>
                  ) : null}

                  {(departmentName || storeName || categoryName) && (
                    <button
                      type="button"
                      onClick={() => setMoreOpen(o => !o)}
                      aria-expanded={moreOpen}
                      className="lg:hidden order-last col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-surface-hover/40 t-meta font-display font-semibold text-text-secondary hover:text-text hover:bg-surface-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                    >
                      {moreOpen ? 'Fewer details' : 'More details'}
                      <ChevronDown size={14} strokeWidth={2.5} className={`transition-transform duration-200 ${moreOpen ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </dl>
              </section>

              {!ticket.declinedAt && <ItemScoreCard scoreAt={(now) => ticketScore(ticket, now)} noun="ticket" />}

              <div className="min-w-0 rounded-xl bg-surface-hover/40 px-2.5 py-2 lg:rounded-none lg:bg-transparent lg:px-0 lg:py-0 lg:border-t lg:border-border/50 lg:pt-4 empty:hidden">
                <DetailLabelsField
                  current={ticket.tags ?? []}
                  onSave={(tagIds) => labelsMut.mutate({ id: ticket.id, payload: { tagIds } })}
                  canCreate={isVerifier}
                  readOnly={!canEdit}
                  iconOnly
                  lockApplied
                  headingClassName={DETAIL_HEADING_CLASS}
                />
              </div>
            </aside>

            <div className="max-lg:contents lg:flex lg:flex-col lg:gap-6 min-w-0 lg:order-1">
              <div className="flex flex-col gap-4 sm:gap-5 min-w-0 max-lg:order-1">
              {ticket.reviewers.length > 0 && (
                <div className="flex items-start gap-2 text-sm">
                  <ShieldCheck size={16} className="mt-0.5 text-text-light shrink-0" />
                  <span className="min-w-0 break-words text-text-secondary">
                    Reviewers: {ticket.reviewers.map((r) => `${r.firstName}${r.lastName ? ` ${r.lastName}` : ''}`).join(', ')}
                  </span>
                </div>
              )}

              {!awaitingHead && !ticket.declinedAt && !!ticket.assignmentApprovedAt && (
                <HeadApprovedBanner approver={ticket.assignmentApprover} approvedAt={ticket.assignmentApprovedAt} departmentName={departmentName} />
              )}
              {awaitingHead && (
                <HeadDecisionPanel
                  itemTitle={ticket.title}
                  raiser={ticket.raisedBy ?? null}
                  assignee={ticket.assignee}
                  departmentName={departmentName}
                  canDecide={canApproveAssignment}
                  isApproving={approveAssignmentMut.isPending}
                  isDeclining={declineMut.isPending}
                  onApprove={() => approveAssignmentMut.mutate({ id: ticket.id })}
                  onDecline={() => setDeclining(true)}
                />
              )}
              {!ticket.declinedAt && <TicketApprovalTrail ticket={ticket} />}
              {!ticket.declinedAt && <VerificationNoteBanner note={ticket.verificationNote} approved={ticket.status === 'CLOSED'} verifiedBy={ticket.verifiedBy} />}

              {editing && canEdit ? (
                <TicketEditForm
                  ticket={ticket}
                  formId={EDIT_FORM_ID}
                  canChangeDue={!ownScope && ticket.status !== 'PENDING_APPROVAL'}
                  canChangePriority={!ownScope}
                  onDirtyChange={setEditDirty}
                  onSave={(payload) => editMut.mutate({ id: ticket.id, payload }, { onSuccess: () => { setEditing(false); setEditDirty(false); } })}
                  onCancel={() => { setEditing(false); setEditDirty(false); }}
                />
              ) : (
                <>
                {ticket.declinedAt && (
                  <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-3" role="status">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-danger to-danger/70 text-white" aria-hidden="true">
                      <Ban size={16} strokeWidth={2.4} />
                    </span>
                    <div className="min-w-0">
                      <p className="t-card font-display font-bold text-danger">
                        Declined{ticket.decliner ? ` by ${ticket.decliner.firstName}` : ''}
                      </p>
                      {ticket.declineReason && <p className="mt-0.5 text-[0.9375rem] font-medium text-text-secondary leading-relaxed break-words">{ticket.declineReason}</p>}
                    </div>
                  </div>
                )}
                <TicketDescription description={ticket.description} />
                </>
              )}

              {ticket.status === 'IN_PROGRESS' && !ticket.declinedAt && !awaitingHead && !editing && (
                <ProgressUpdatesPanel ticket={ticket} canPost={workerCanMove} onPreview={setPreviewImage} />
              )}

              <TicketAttachments
                ticketId={ticket.id}
                attachments={ticket.attachments ?? []}
                canEdit={canEdit}
                canRemove={canRemovePhoto}
                onPreview={setPreviewImage}
              />

              {(ticket.checklists?.length ?? 0) > 0 && (
                <ChecklistPanel ticketId={ticket.id} checklists={ticket.checklists} workerIds={ticket.assignee ? [ticket.assignee.id] : []} />
              )}
              </div>

              <div className="flex flex-col gap-4 sm:gap-5 min-w-0 max-lg:order-3">
              <TicketStatusHistory ticket={ticket} departmentName={departmentName} onPreview={setPreviewImage} />
              </div>
            </div>
          </div>

          <p className="mt-5 flex items-center gap-1.5 border-t border-border/50 pt-3 t-meta font-medium text-text-muted">
            <CalendarDays size={12} className="shrink-0 text-text-light" strokeWidth={2.25} aria-hidden="true" />
            {raisedByName ? `Raised by ${raisedByName}` : 'Raised'}, {formatRaised(ticket.createdAt)}
          </p>
        </div>

        {showFooter && (
          editing ? (
            <div className="shrink-0 flex flex-col gap-2 border-t border-border/60 bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6 sm:py-3.5 lg:px-8">
              {editMut.isError && (
                <p role="alert" className="flex items-start gap-1.5 t-meta font-medium font-display text-danger min-w-0 sm:mr-auto">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden />
                  <span className="min-w-0 break-words">{errorMessage(editMut.error, "Couldn't save the ticket. Try again.")}</span>
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
                <Button variant="outline" onClick={cancelEditing} disabled={editMut.isPending} className="h-11 sm:h-10 font-display">
                  Cancel
                </Button>
                <Button type="submit" form={EDIT_FORM_ID} variant="primary" isLoading={editMut.isPending} className="h-11 sm:h-10 font-display">
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="shrink-0 flex flex-col gap-2 border-t border-border/60 bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3 sm:px-6 sm:py-3.5 lg:px-8">
              {showVerify && (
                <div className="min-w-0 sm:flex-1 sm:basis-72 sm:max-w-md">
                  <TicketVerificationActions
                    ticketTitle={ticket.title}
                    isPending={verifyMut.isPending}
                    finalApproval={isFinalApproval(currentUser, ticket)}
                    onApprove={() => verifyMut.mutate({ id: ticket.id, payload: { action: 'APPROVE' } }, { onSuccess: onClose })}
                    onSendBack={note => verifyMut.mutate({ id: ticket.id, payload: { action: 'REJECT', note } }, { onSuccess: onClose })}
                  />
                </div>
              )}
              {canReopenDeclined && (
                <Button
                  variant="primary"
                  size="md"
                  isLoading={reopenMut.isPending}
                  disabled={reopenMut.isPending}
                  onClick={() => reopenMut.mutate({ id: ticket.id })}
                  className="max-sm:flex-1 max-sm:h-11 gap-1.5 font-display font-semibold"
                >
                  <RotateCcw size={16} aria-hidden />
                  Reopen ticket
                </Button>
              )}
              {statusOptions.length > 0 && (
                <TicketStatusMenu
                  options={statusOptions}
                  current={ticket.status}
                  onPick={handlePickStatus}
                  isBusy={updateMut.isPending || statusUpdateMut.isPending}
                />
              )}
              {canDecline && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeclining(true)}
                  disabled={declineMut.isPending}
                  className="max-sm:order-last max-sm:self-center sm:order-first font-display text-danger hover:text-danger hover:bg-danger/10"
                >
                  <Ban size={14} aria-hidden />
                  Decline ticket
                </Button>
              )}
              {canWithdraw && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleWithdraw}
                  isLoading={deleteMut.isPending}
                  disabled={deleteMut.isPending}
                  className="max-sm:order-last max-sm:self-center sm:order-first font-display text-danger hover:text-danger hover:bg-danger/10"
                >
                  Withdraw ticket
                </Button>
              )}
            </div>
          )
        )}

        <ImageLightbox src={previewImage} onClose={() => setPreviewImage(null)} />

        <TicketActivitySheet ticketId={ticket.id} open={activityOpen} onOpenChange={setActivityOpen} />

        <DeclineTicketDialog
          open={declining}
          ticketTitle={ticket.title}
          isPending={declineMut.isPending}
          onCancel={() => setDeclining(false)}
          onConfirm={(reason) => declineMut.mutate({ id: ticket.id, reason }, { onSuccess: () => setDeclining(false) })}
        />

      </SheetContent>

      {quickStatusPick && (
        <TicketStatusRemarkDialog
          ticket={ticket}
          toStatus={quickStatusPick}
          isSubmitting={statusUpdateMut.isPending}
          photos={quickStatusPhotos}
          onAddPhotos={addQuickStatusPhotos}
          onRemovePhoto={i => setQuickStatusPhotos(prev => prev.filter((_, idx) => idx !== i))}
          onCancel={() => { setQuickStatusPick(null); setQuickStatusPhotos([]); }}
          onConfirm={(remark) => {
            statusUpdateMut.mutate(
              {
                status: quickStatusPick,
                remark: remark || undefined,
                captureMethod: quickStatusPhotos.length ? quickStatusCaptureMethod : undefined,
                files: quickStatusPhotos,
              },
              { onSuccess: () => { setQuickStatusPick(null); setQuickStatusPhotos([]); } },
            );
          }}
        />
      )}
    </Sheet>
  );
};
