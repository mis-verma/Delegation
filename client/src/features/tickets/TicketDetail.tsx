import { useRef, useState } from 'react';
import { ShieldCheck, Flag, Building2, CalendarDays, User, Store as StoreIcon, Layers, ChevronDown, AlertCircle } from 'lucide-react';
import {
  useStoresQuery,
  useTicketQuery,
  useUpdateTicketMutation,
  useDeleteTicketMutation,
  useAssignableUsersQuery,
  useVerifyTicketMutation,
  useAddTicketStatusUpdateMutation,
  useDepartmentsQuery,
} from './hook';
import { Button, ImageLightbox, PriorityChip } from '../../components';
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
import { PROPERTY_TRIGGER_CLASS, PROPERTY_VALUE_CLASS, dueTone } from './detail/propertyStyles';
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
import { canApproveWork } from '../../lib/canApproveWork';
import { ticketScore } from '../../lib/itemScore';
import { ItemScoreCard } from '../../components/itemScoreCard/ItemScoreCard';

interface TicketDetailProps {
  ticket: Ticket;
  onClose: () => void;
}

const EDIT_FORM_ID = 'ticket-edit-form';

/** "15 Oct, 10:45 AM", with the year only when it isn't this year. */
const formatRaised = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const day = d.toLocaleDateString(undefined, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  return `${day}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};
// Roles that may send a ticket to another person (the server refuses USER/AGENT; assertCanMutate
// keeps a Manager to their department or store and a Senior to their store).
const ROUTING_ROLES: readonly Role[] = ['ADMIN', 'PC', 'MANAGER', 'SENIOR'];

export const TicketDetail = ({ ticket: initialTicket, onClose }: TicketDetailProps) => {
  const { data: fresh, isPending } = useTicketQuery(initialTicket.id);
  const ticket = fresh ?? initialTicket;

  const { user: currentUser } = useAuth();
  const role = currentUser?.role;
  const isAdmin = role === 'ADMIN' || role === 'PC';
  const isVerifier = isAdmin;
  // Front-line staff (USER/AGENT): their own work only, no routing, priority or due changes.
  const ownScope = !!role && OWN_SCOPE_ROLES.includes(role);
  // One rule for "may change this ticket": editing its text, adding photos, moving its status.
  const canChangeStatus = canChangeTicket(currentUser, ticket);
  const canEdit = canChangeStatus && ticket.status !== 'CLOSED';
  // Picking the person: whoever can route tickets and may change this one, never on a closed ticket.
  const canRoute = canEdit && !!role && ROUTING_ROLES.includes(role);
  // The raiser can take back a ticket nobody has started yet. Only judged on the full record
  // (`fresh`), which carries the status history the decision depends on.
  const canWithdraw = !!fresh && canWithdrawTicket(currentUser, ticket);
  // Removing a ticket photo: anyone who may edit the ticket, but proof photos from a status change
  // and photos on a closed ticket stay unless an Admin removes them (ticketAttachment.service.ts).
  const canRemovePhoto = (a: TicketAttachment) =>
    role === 'ADMIN' || (canEdit && !a.statusUpdateId);

  const updateMut = useUpdateTicketMutation();
  // The edit form shows a failed save next to its own Save button, so no toast as well.
  const editMut = useUpdateTicketMutation({ inlineError: true });
  const labelsMut = useUpdateTicketMutation({ silent: true });
  const deleteMut = useDeleteTicketMutation({ withdraw: !isAdmin });
  const verifyMut = useVerifyTicketMutation();

  const { data: assignableUsers } = useAssignableUsersQuery(ticket.departmentId ?? undefined);
  const { data: departments } = useDepartmentsQuery();
  // The current assignee may sit outside this department's assignable roster (moved, or picked
  // before a department change). Without them in the list the picker showed "Unassigned".
  const assigneeOptions: AssignableUser[] | undefined = ticket.assignee && assignableUsers && !assignableUsers.some(u => u.id === ticket.assignee!.id)
    ? [...assignableUsers, { id: ticket.assignee.id, firstName: ticket.assignee.firstName, lastName: null, email: ticket.assignee.email, role: ticket.assignee.role as Role, departmentId: null }]
    : assignableUsers;
  const departmentName = ticket.departmentId ? departments?.find(d => d.id === ticket.departmentId)?.name : undefined;
  const { data: stores } = useStoresQuery();
  const { data: categories } = useCategoriesQuery();
  const storeName = ticket.storeId ? stores?.find(s => s.id === ticket.storeId)?.name : undefined;
  const categoryName = ticket.categoryId ? categories?.find(c => c.id === ticket.categoryId)?.name : undefined;
  // Raised-by is only a user id on the ticket. "You" when it is the viewer, otherwise looked up in
  // the roster already loaded for the assignee picker; left out when neither resolves.
  const raisedByUser = assignableUsers?.find(u => u.id === ticket.userId);
  const raisedByName = ticket.userId === currentUser?.id
    ? 'You'
    : raisedByUser ? `${raisedByUser.firstName} ${raisedByUser.lastName ?? ''}`.trim() : null;

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [editDirty, setEditDirty] = useState(false);
  // Phone only: Department, Store and Category fold away behind "More details"; the rail shows them all.
  const [moreOpen, setMoreOpen] = useState(false);
  // Activity and the change log live in their own sheet, opened from the header's More menu.
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

  // Every way out of the sheet (X, Escape, phone back) asks first while the edit form has changes.
  // Returning the promise tells the phone back handler the sheet is still deciding.
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

  // Asked first: a delete takes the ticket off every list for everyone working on it.
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

  // The raiser's own take-back. Asked first because it can't be undone from here.
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

  // On Hold opens the remark popup (remark required, optional proof photos), the same gate a board
  // drag goes through; Mark completed opens it with the note optional; In progress is one tap.
  const [quickStatusPick, setQuickStatusPick] = useState<RestrictedStatus | null>(null);
  const [quickStatusPhotos, setQuickStatusPhotos] = useState<File[]>([]);
  const [quickStatusCaptureMethod, setQuickStatusCaptureMethod] = useState<CaptureMethod>('GALLERY');

  const addQuickStatusPhotos = (files: FileList | null, method: CaptureMethod) => {
    if (!files || !files.length) return;
    setQuickStatusPhotos(prev => [...prev, ...Array.from(files)]);
    setQuickStatusCaptureMethod(method);
  };

  // Admin/PC, the department's Manager or a named reviewer; never the person it is assigned to (lib/canApproveWork).
  const showVerify = ticket.status === 'PENDING_APPROVAL' && canApproveWork(currentUser, {
    departmentId: ticket.departmentId,
    assigneeIds: ticket.assignee ? [ticket.assignee.id] : [],
    reviewers: ticket.reviewers,
  });
  // Work moves belong to the person doing the work. For front-line staff that means the assignee
  // only: someone who just raised the ticket can edit or withdraw it, not move it (the server
  // refuses it too). Nobody but a verifier moves a closed or handed-in ticket.
  const workerCanMove = canChangeStatus
    && ticket.status !== 'CLOSED'
    && ticket.status !== 'PENDING_APPROVAL'
    && (!ownScope || ticket.assigneeId === currentUser?.id);
  // 'CLOSED' is never a plain pick, even for a verifier: closing is the Approve decision. While the
  // viewer can approve, Approve and Send back are the only choices on screen.
  const statusOptions = showVerify
    ? []
    : (isVerifier ? STATUS_OPTIONS : workerCanMove ? STATUS_UPDATE_OPTIONS : [])
      .filter(s => s.value !== ticket.status && s.value !== 'CLOSED')
      .map(s => (s.value === 'PENDING_APPROVAL' ? { ...s, label: HAND_IN_LABEL } : s));

  const handlePickStatus = (next: TicketStatus) => {
    if (next === 'ON_HOLD' || next === 'PENDING_APPROVAL') setQuickStatusPick(next);
    else if ((RESTRICTED_STATUSES as readonly string[]).includes(next)) statusUpdateMut.mutate({ status: next as RestrictedStatus });
    else updateMut.mutate({ id: ticket.id, payload: { status: next } });
  };

  const statusLabel = getTicketStatusLabel(ticket.status);
  const assigneeName = ticket.assignee?.firstName ?? null;
  const showFooter = editing || showVerify || statusOptions.length > 0 || canWithdraw;
  // The list row already carries the full ticket, so a loading bar only helps when it doesn't.
  const showLoadingBar = isPending && initialTicket.statusUpdates === undefined;

  return (
    <Sheet open onOpenChange={v => { if (!v) return requestClose(); }}>
     
      <SheetContent
        showCloseButton={false}
        onInteractOutside={(e) => { if (editing && editDirty) e.preventDefault(); }}
        // Not the ticket-code button: Radix focusing it on open drew a focus ring before anyone touched anything.
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

        {/* Little top padding: the description continues straight on from the title above. */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-1 pb-4 sm:px-6 sm:pt-1.5 sm:pb-5 lg:px-8 lg:pt-2 lg:pb-6 custom-scrollbar">
      
          <div className="flex flex-col gap-4 sm:gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-x-8">
            <aside
              aria-label="Ticket properties"
              className="flex flex-col gap-4 min-w-0 max-lg:order-2 max-lg:rounded-xl max-lg:border max-lg:border-border/60 max-lg:bg-surface-hover/30 max-lg:p-3 sm:max-lg:p-4 lg:order-2 lg:sticky lg:top-0 lg:rounded-xl lg:border lg:border-border lg:bg-surface lg:p-5"
            >
              
              <section className="flex flex-col gap-2 lg:gap-3">
                <dl className="grid grid-cols-2 gap-2 lg:flex lg:flex-col lg:gap-0 lg:divide-y lg:divide-border/60">
                  <TicketPropertyRow label="Priority" stackOnPhone icon={Flag} tone={PRIORITY_CONFIG[ticket.priority].solid}>
                    {/* Same rule as the edit form (canChangePriority): front-line staff see the chip, everyone else can change it here. */}
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
                    <TicketPropertyRow label="Department" wide icon={Building2} tone="bg-linear-to-br from-coral-500 to-coral-600" phoneHidden={!moreOpen}>
                      <span className={PROPERTY_VALUE_CLASS}>{departmentName}</span>
                    </TicketPropertyRow>
                  )}

                  {storeName && (
                    <TicketPropertyRow label="Store" wide icon={StoreIcon} tone="bg-linear-to-br from-info to-info/70" phoneHidden={!moreOpen}>
                      <span className={PROPERTY_VALUE_CLASS}>{storeName}</span>
                    </TicketPropertyRow>
                  )}

                  {categoryName && (
                    <TicketPropertyRow label="Category" wide icon={Layers} tone="bg-linear-to-br from-success to-success/70" phoneHidden={!moreOpen}>
                      <span className={PROPERTY_VALUE_CLASS}>{categoryName}</span>
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
                      // Same row as the picker, without its "Change": read-only for this viewer.
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
                    <TicketPropertyRow label="Due" stackOnPhone icon={CalendarDays} tone={dueTone(due.overdue)}>
                      <span className={`t-meta font-display font-semibold leading-snug ${due.overdue ? 'text-danger' : 'text-text'}`}>
                        {due.text.replace(/^Due\s+/i, '').replace(/^./, (c) => c.toUpperCase())}
                      </span>
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

              {/* How this ticket counts in the scores right now; ticks while open, and status changes arrive by socket. */}
              <ItemScoreCard scoreAt={(now) => ticketScore(ticket, now)} noun="ticket" />

              {/* Same inline label field as the create form; each change saves at once. Editable by
                  whoever may change the ticket, read-only chips for everyone else. */}
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
              {/* No reviewer picker: PC and Admin verify every ticket by default. Older tickets that
                  named reviewers still show them, read-only. */}
              {ticket.reviewers.length > 0 && (
                <div className="flex items-start gap-2 text-sm">
                  <ShieldCheck size={16} className="mt-0.5 text-text-light shrink-0" />
                  <span className="min-w-0 break-words text-text-secondary">
                    Reviewers: {ticket.reviewers.map((r) => `${r.firstName}${r.lastName ? ` ${r.lastName}` : ''}`).join(', ')}
                  </span>
                </div>
              )}

              <VerificationNoteBanner note={ticket.verificationNote} approved={ticket.status === 'CLOSED'} verifiedBy={ticket.verifiedBy} />

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
                <TicketDescription description={ticket.description} />
              )}

              <TicketAttachments
                ticketId={ticket.id}
                attachments={ticket.attachments ?? []}
                canEdit={canEdit}
                canRemove={canRemovePhoto}
                onPreview={setPreviewImage}
              />

              {/* The server won't take Mark completed while a checklist step is neither done nor
                  explained, so the checklist has to be workable right here. */}
              {(ticket.checklists?.length ?? 0) > 0 && (
                <ChecklistPanel ticketId={ticket.id} checklists={ticket.checklists} workerIds={ticket.assignee ? [ticket.assignee.id] : []} />
              )}
              </div>

              <div className="flex flex-col gap-4 sm:gap-5 min-w-0 max-lg:order-3">
              <TicketStatusHistory
                statusUpdates={ticket.statusUpdates}
                onPreview={setPreviewImage}
                closure={ticket.status === 'CLOSED' && (ticket.verifiedAt ?? ticket.closedAt)
                  ? { at: (ticket.verifiedAt ?? ticket.closedAt) as string, by: ticket.verifier?.firstName ?? null, note: ticket.verificationNote }
                  : null}
              />
              </div>
            </div>
          </div>

          {/* Who raised it and when: reference, not something to act on, so it closes the page. */}
          <p className="mt-5 flex items-center gap-1.5 border-t border-border/50 pt-3 t-meta font-medium text-text-muted">
            <CalendarDays size={12} className="shrink-0 text-text-light" strokeWidth={2.25} aria-hidden="true" />
            {raisedByName ? `Raised by ${raisedByName}` : 'Raised'}, {formatRaised(ticket.createdAt)}
          </p>
        </div>

        {/* Sticky action bar. A flex sibling of the scrolling body (not an overlay), so nothing is
            ever hidden behind it and it stays above the phone keyboard; padded for the iPhone home
            indicator. While editing it holds only Cancel and Save. */}
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
              {/* Single-stage verify: one reviewer's decision closes it or sends it back. */}
              {showVerify && (
                <div className="min-w-0 sm:flex-1 sm:basis-72 sm:max-w-md">
                  <TicketVerificationActions
                    ticketTitle={ticket.title}
                    isPending={verifyMut.isPending}
                    onApprove={() => verifyMut.mutate({ id: ticket.id, payload: { action: 'APPROVE' } }, { onSuccess: onClose })}
                    onSendBack={note => verifyMut.mutate({ id: ticket.id, payload: { action: 'REJECT', note } }, { onSuccess: onClose })}
                  />
                </div>
              )}
              {statusOptions.length > 0 && (
                <TicketStatusMenu
                  options={statusOptions}
                  current={ticket.status}
                  onPick={handlePickStatus}
                  isBusy={updateMut.isPending || statusUpdateMut.isPending}
                />
              )}
              {/* A quiet text button: on a phone it sits small and centred under the main button,
                  never as a red bar competing with it. */}
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
