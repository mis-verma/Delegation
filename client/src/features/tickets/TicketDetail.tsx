import { useState } from 'react';
import { ShieldCheck, Pencil, CalendarDays, User, Store as StoreIcon, Layers, ChevronDown, AlertTriangle } from 'lucide-react';
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
import { ImageLightbox, ActivityFeed, FullChangeLog, IconChip, StatusChip, PriorityChip, DepartmentChip, type StatusChipStatus } from '../../components';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useCategoriesQuery } from '../settings/hook';
import { DetailLabelsField } from '../tags/DetailLabelsField';
import { useAuth } from '../../context/AuthContext';
import { getTicketStatusLabel } from '../../lib/ticketStatusLabel';
import { getInitials } from '../../lib/getInitials';
import { avatarColorClass } from '../../lib/avatarColors';
import { STATUS_OPTIONS, STATUS_UPDATE_OPTIONS } from './detail/detailConstants';
import { PRIORITY_CONFIG, formatShortDateTime } from './ticketDisplay';
import { TicketDetailHeader } from './detail/TicketDetailHeader';
import { TicketPropertyRow } from './detail/TicketPropertyRow';
import { VerificationNoteBanner } from '../../components/verificationBanner';
import { TicketDescription } from './detail/TicketDescription';
import { TicketAttachments } from './detail/TicketAttachments';
import { TicketEditForm } from './detail/TicketEditForm';
import { canChangeTicket } from './ticketPermissions';
import { TicketStatusHistory } from './detail/TicketStatusHistory';
import { TicketVerificationActions } from './detail/TicketVerificationActions';
import { TicketStatusMenu } from './detail/TicketStatusMenu';
import { TicketStatusRemarkDialog } from './TicketStatusRemarkDialog';
import { useConfirm } from '@/components/confirmDialog';
import type { AssignableUser } from '../../api/users';
import type { Role } from '../../api/auth';
import { AssigneeField } from '../assignees/AssigneeField';
import { DETAIL_HEADING_CLASS } from '../tasks/taskFormFieldStyles';
import { RESTRICTED_STATUSES, type Ticket, type TicketStatus, type RestrictedStatus, type CaptureMethod } from '../../api/ticket';

interface TicketDetailProps {
  ticket: Ticket;
  onClose: () => void;
}

export const TicketDetail = ({ ticket: initialTicket, onClose }: TicketDetailProps) => {
  const { data: fresh, isPending } = useTicketQuery(initialTicket.id);
  const ticket = fresh ?? initialTicket;
  
  const updateMut = useUpdateTicketMutation();
  const labelsMut = useUpdateTicketMutation({ silent: true });
  const deleteMut = useDeleteTicketMutation();
  const verifyMut = useVerifyTicketMutation();

  const { user: currentUser } = useAuth();
  const canAssign = currentUser?.role === "ADMIN" || currentUser?.role === "PC" || currentUser?.role === "MANAGER";
  
  const isAdmin = currentUser?.role === "ADMIN" || currentUser?.role === "PC";
  const isVerifier = currentUser?.role === "PC" || currentUser?.role === "ADMIN";
  // One rule for "may change this ticket": moving its status, editing its text, adding photos.
  const canChangeStatus = canChangeTicket(currentUser, ticket);
  const canEdit = canChangeStatus && ticket.status !== 'CLOSED';

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
  // the roster already loaded for the assignee picker; the row is left out when neither resolves.
  const raisedByUser = assignableUsers?.find(u => u.id === ticket.userId);
  const raisedByName = ticket.userId === currentUser?.id
    ? 'You'
    : raisedByUser ? `${raisedByUser.firstName} ${raisedByUser.lastName ?? ''}`.trim() : null;

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // Phone only: Department, Store and Category fold away behind "More details"; the rail shows them all.
  const [moreOpen, setMoreOpen] = useState(false);
  // Phone only: History and Activity share one tab strip; from lg both are on the page.
  const [lowerTab, setLowerTab] = useState<'history' | 'activity'>('history');
  const statusUpdateMut = useAddTicketStatusUpdateMutation(ticket.id);

  const confirm = useConfirm();
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

  const isOverdue = ticket.isOverdue && ticket.status !== 'CLOSED';

  // One status control for everyone who can change status. Verifiers get every status; everyone
  // else gets the three work moves (In Progress / On Hold / Completed) until the ticket is waiting
  // on review or closed. Only On Hold opens the remark popup (remark required, optional proof
  // photos), the same gate a board drag goes through; In Progress and Completed are one tap, and
  // Completed hands the ticket straight to PC for approval. This replaces the old
  // always-open "Update Status" panel, which pinned a textarea and six buttons over half the sheet.
  const [quickStatusPick, setQuickStatusPick] = useState<RestrictedStatus | null>(null);
  const [quickStatusPhotos, setQuickStatusPhotos] = useState<File[]>([]);
  const [quickStatusCaptureMethod, setQuickStatusCaptureMethod] = useState<CaptureMethod>('GALLERY');

  const addQuickStatusPhotos = (files: FileList | null, method: CaptureMethod) => {
    if (!files || !files.length) return;
    setQuickStatusPhotos(prev => [...prev, ...Array.from(files)]);
    setQuickStatusCaptureMethod(method);
  };

  const workerCanMove = canChangeStatus && ticket.status !== 'CLOSED' && ticket.status !== 'PENDING_APPROVAL';
  // 'CLOSED' is deliberately excluded from the picker even for a verifier — closing is a
  // verification decision (TicketVerificationActions' Approve button below, only shown once the
  // ticket is actually PENDING_APPROVAL), not a plain status pick. The server backs this up too
  // (ticket.service.ts's update() now refuses a direct move to CLOSED for the same reason: it
  // used to skip the checklist gate and never recorded who approved it).
  const statusOptions = (isVerifier ? STATUS_OPTIONS : workerCanMove ? STATUS_UPDATE_OPTIONS : [])
    .filter(s => s.value !== ticket.status && s.value !== 'CLOSED');

  const handlePickStatus = (next: TicketStatus) => {
    // On Hold must be explained. Completed (which sends it to PC for approval) opens a small popup
    // where the note is the person's choice. In Progress is one tap with no popup.
    if (next === 'ON_HOLD' || next === 'PENDING_APPROVAL') setQuickStatusPick(next);
    else if ((RESTRICTED_STATUSES as readonly string[]).includes(next)) statusUpdateMut.mutate({ status: next as RestrictedStatus });
    else updateMut.mutate({ id: ticket.id, payload: { status: next } });
  };

  const statusChipStatus = ticket.status.toLowerCase() as StatusChipStatus;
  const statusLabel = getTicketStatusLabel(
    ticket.status,
    currentUser?.role,
    STATUS_OPTIONS.find(s => s.value === ticket.status)?.label ?? ticket.status,
  );
  const assigneeName = ticket.assignee?.firstName ?? null;
  const showVerify = isVerifier && ticket.status === 'PENDING_APPROVAL';
  const showFooter = showVerify || statusOptions.length > 0;
  const hasHistory = (ticket.statusUpdates?.length ?? 0) > 0;
  // With no status history there is nothing to switch between, so Activity is the only view.
  const shownTab = hasHistory ? lowerTab : 'activity';

  return (
    <Sheet open onOpenChange={v => { if (!v) onClose(); }}>
      {/* Phone: full-screen sheet. sm/md: a 600 / 680px panel. lg/xl: wide enough for the body to
          split into a reading column plus a properties rail. shadow-none: the shared sheet's own
          drop shadow is not part of this app's border-only elevation. The shared close button is
          off, the header draws its own 44px one. */}
      <SheetContent
        showCloseButton={false}
        className="w-full sm:max-w-[600px] md:max-w-[680px] lg:max-w-[880px] xl:max-w-[1040px] p-0 flex flex-col h-full overflow-hidden font-sans shadow-none"
      >
        {/* Indeterminate loading bar */}
        {isPending && (
          <div className="absolute top-0 left-0 right-0 z-50 h-[3px] w-full bg-primary-500/15 overflow-hidden">
            <div className="h-full bg-primary-500 w-1/2 rounded-r-full animate-[slide_1.5s_ease-in-out_infinite]" />
          </div>
        )}

        <TicketDetailHeader
          ticket={ticket}
          statusLabel={statusLabel}
          onDelete={isAdmin ? handleDelete : undefined}
          isDeleting={deleteMut.isPending}
        />

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 custom-scrollbar">
          {/* One column up to md: the description first, then the properties card, then the history.
              From lg a reading column on the left and a sticky properties rail on the right. The
              reading column is `contents` below lg so its two halves and the rail can be ordered
              as siblings. */}
          <div className="flex flex-col gap-5 sm:gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] xl:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-x-8">
            <aside
              aria-label="Ticket properties"
              className="flex flex-col gap-4 min-w-0 max-lg:order-2 max-lg:rounded-xl max-lg:border max-lg:border-border/60 max-lg:bg-surface-hover/30 max-lg:p-3 sm:max-lg:p-4 lg:order-2 lg:sticky lg:top-0 lg:rounded-xl lg:border lg:border-border/60 lg:bg-surface-hover/30 lg:p-4"
            >
              {/* Phone and tablet: every property is a chip in one wrapping row. lg: the same
                  elements become labelled rows (see TicketPropertyRow). */}
              <section className="flex flex-col gap-2 lg:gap-3">
                <dl className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-stretch lg:gap-0 lg:divide-y lg:divide-border/50">
                  {/* The sticky header already carries the status chip on every size, so the chip
                      row skips it; the rail repeats it with the other properties. */}
                  <TicketPropertyRow label="Status" railOnly>
                    <StatusChip status={statusChipStatus} label={statusLabel} />
                  </TicketPropertyRow>

                  <TicketPropertyRow label="Priority" chipOrderClass="max-lg:order-2">
                    <PriorityChip meta={PRIORITY_CONFIG[ticket.priority]} />
                  </TicketPropertyRow>

                  {departmentName && (
                    <TicketPropertyRow label="Department" chipOrderClass={moreOpen ? 'max-lg:order-5' : 'max-lg:order-5 max-lg:hidden'}>
                      <span title="Department" className="inline-flex min-w-0">
                        <DepartmentChip name={departmentName} />
                      </span>
                    </TicketPropertyRow>
                  )}

                  {storeName && (
                    <TicketPropertyRow label="Store" chipOrderClass={moreOpen ? 'max-lg:order-6' : 'max-lg:order-6 max-lg:hidden'}>
                      <IconChip icon={StoreIcon} tone="bg-primary-700 dark:bg-primary-400" label={storeName} title="Store" className="max-w-full" />
                    </TicketPropertyRow>
                  )}

                  {categoryName && (
                    <TicketPropertyRow label="Category" chipOrderClass={moreOpen ? 'max-lg:order-7' : 'max-lg:order-7 max-lg:hidden'}>
                      <IconChip icon={Layers} tone="bg-primary-700 dark:bg-primary-400" label={categoryName} title="Category" className="max-w-full" />
                    </TicketPropertyRow>
                  )}

                  <TicketPropertyRow label="Assignee" chipOrderClass="max-lg:order-1 max-lg:w-full">
                    {canAssign ? (
                      // The shared picker keeps its 32px avatar and carries its own invisible 44px
                      // touch hit area, so nothing is stretched from out here.
                      <div title="Assignee" className="flex items-center max-lg:w-full">
                        <AssigneeField
                          single
                          hideLabel
                          selectedIds={ticket.assigneeId ? [ticket.assigneeId] : []}
                          onChange={ids => updateMut.mutate({ id: ticket.id, payload: { assigneeId: ids[0] ?? null } })}
                          users={assigneeOptions}
                        />
                      </div>
                    ) : (
                      <span title="Assignee" className="inline-flex items-center gap-1.5 min-w-0 pl-1 pr-2.5 py-1 rounded-full border border-border/60 bg-surface text-xs font-semibold text-text max-lg:w-full max-lg:rounded-lg max-lg:py-2 max-lg:text-sm">
                        {assigneeName ? (
                          <span className={`flex items-center justify-center size-5 rounded-full text-white text-[0.5625rem] font-bold shrink-0 ${avatarColorClass(assigneeName)}`}>
                            {getInitials(assigneeName)}
                          </span>
                        ) : (
                          <span className="flex items-center justify-center size-5 rounded-full bg-surface-hover text-text-light shrink-0">
                            <User size={11} />
                          </span>
                        )}
                        <span className="truncate">{assigneeName ?? 'Unassigned'}</span>
                      </span>
                    )}
                  </TicketPropertyRow>

                  {raisedByName && (
                    <TicketPropertyRow label="Raised by" railOnly>
                      <span className="text-sm font-medium text-text break-words">{raisedByName}</span>
                    </TicketPropertyRow>
                  )}

                  {ticket.tatDueAt ? (
                    <TicketPropertyRow label="Due" chipOrderClass="max-lg:order-4">
                      <IconChip
                        icon={CalendarDays}
                        tone={isOverdue ? 'bg-danger' : 'bg-primary-700 dark:bg-primary-400'}
                        label={`${isOverdue ? 'Delayed · ' : 'Due '}${new Date(ticket.tatDueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
                        title="SLA deadline"
                        className={isOverdue ? 'border-danger/30' : undefined}
                        labelClassName={isOverdue ? 'text-danger' : undefined}
                      />
                    </TicketPropertyRow>
                  ) : null}

                  <TicketPropertyRow label="Created" railOnly>
                    <span className="text-sm font-medium text-text tabular-nums">{formatShortDateTime(ticket.createdAt)}</span>
                  </TicketPropertyRow>

                  {(departmentName || storeName || categoryName) && (
                    <button
                      type="button"
                      onClick={() => setMoreOpen(o => !o)}
                      aria-expanded={moreOpen}
                      className="lg:hidden order-8 relative inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-display font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-500/10 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 after:absolute after:-inset-y-2 after:inset-x-0"
                    >
                      {moreOpen ? 'Fewer details' : 'More details'}
                      <ChevronDown size={13} strokeWidth={2.5} className={`transition-transform duration-200 ${moreOpen ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </dl>
              </section>

              {/* Same inline label field as the create form; each change saves at once. Editable by
                  whoever can reassign the ticket, read-only chips for everyone else. */}
              <div className="min-w-0 lg:border-t lg:border-border/50 lg:pt-4 empty:hidden">
                <DetailLabelsField
                  current={ticket.tags ?? []}
                  onSave={(tagIds) => labelsMut.mutate({ id: ticket.id, payload: { tagIds } })}
                  canCreate={isVerifier}
                  readOnly={!canEdit}
                  hideHeading
                  headingClassName={DETAIL_HEADING_CLASS}
                />
              </div>
            </aside>

            <div className="max-lg:contents lg:flex lg:flex-col lg:gap-6 min-w-0 lg:order-1">
              <div className="flex flex-col gap-5 sm:gap-6 min-w-0 max-lg:order-1">
              {/* No reviewer picker: PC and Admin verify every ticket by default. Older tickets that
                  named reviewers still show them, read-only. */}
              {ticket.reviewers.length > 0 && (
                <div className="flex items-start gap-2 text-sm">
                  <ShieldCheck size={15} className="mt-0.5 text-text-light shrink-0" />
                  <span className="min-w-0 break-words text-text-secondary">
                    Reviewers: {ticket.reviewers.map((r) => `${r.firstName}${r.lastName ? ` ${r.lastName}` : ''}`).join(', ')}
                  </span>
                </div>
              )}

              {isOverdue && ticket.tatDueAt && (
                <div className="lg:hidden flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm font-display font-semibold text-danger">
                  <AlertTriangle size={15} className="shrink-0" aria-hidden />
                  Delayed, due {new Date(ticket.tatDueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </div>
              )}

              <VerificationNoteBanner note={ticket.verificationNote} approved={ticket.status === 'CLOSED'} verifiedBy={ticket.verifiedBy} />

              {editing && canEdit ? (
                <TicketEditForm
                  ticket={ticket}
                  isSaving={updateMut.isPending}
                  onSave={(payload) => updateMut.mutate({ id: ticket.id, payload }, { onSuccess: () => setEditing(false) })}
                  onCancel={() => setEditing(false)}
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="self-start relative inline-flex items-center gap-1.5 h-8 px-2.5 -ml-2.5 rounded-full text-xs font-display font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-500/10 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 after:absolute after:-inset-y-1.5 after:inset-x-0"
                    >
                      <Pencil size={13} strokeWidth={2.5} />
                      Edit title and details
                    </button>
                  )}
                  <TicketDescription description={ticket.description} />
                </div>
              )}

              <TicketAttachments
                ticketId={ticket.id}
                attachments={ticket.attachments ?? []}
                canEdit={canEdit}
                onPreview={setPreviewImage}
              />
              </div>

              <div className="flex flex-col gap-5 sm:gap-6 min-w-0 max-lg:order-3">

              {/* No standalone attachments/comments UI here (removed by request, same call as
                  Delegation's own — TaskDetail.tsx carries the identical reasoning): every status
                  change already goes through TicketStatusRemarkDialog below, which takes a mandatory
                  remark and optional proof photos, so this sheet already has one place to say
                  something and show evidence without a second, separate mechanism duplicating it. */}
              {hasHistory && (
                <div role="tablist" aria-label="Ticket history" className="lg:hidden flex gap-1 rounded-full bg-surface-hover/60 p-1">
                  {(['history', 'activity'] as const).map(k => (
                    <button
                      key={k}
                      type="button"
                      role="tab"
                      aria-selected={shownTab === k}
                      onClick={() => setLowerTab(k)}
                      className={`flex-1 h-9 rounded-full text-sm font-display font-semibold cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-colors duration-150 ${shownTab === k ? 'bg-primary-600 text-white dark:bg-primary-500' : 'text-text-muted'}`}
                    >
                      {k === 'history' ? 'History' : 'Activity'}
                    </button>
                  ))}
                </div>
              )}

              {hasHistory && (
                <div className={shownTab === 'history' ? '' : 'max-lg:hidden'}>
                <TicketStatusHistory
                  statusUpdates={ticket.statusUpdates}
                  onPreview={setPreviewImage}
                  closure={ticket.status === 'CLOSED' && (ticket.verifiedAt ?? ticket.closedAt)
                    ? { at: (ticket.verifiedAt ?? ticket.closedAt) as string, by: ticket.verifier?.firstName ?? null, note: ticket.verificationNote }
                    : null}
                />
                </div>
              )}

              <div className={`flex flex-col gap-5 sm:gap-6 ${shownTab === 'activity' ? '' : 'max-lg:hidden'}`}>
                <ActivityFeed entityType="Ticket" entityId={ticket.id} />
                <FullChangeLog entityType="Ticket" entityId={ticket.id} />
              </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky action bar. A flex sibling of the scrolling body (not an overlay), so nothing is
            ever hidden behind it; padded for the iPhone home indicator. Phone: stacked, buttons
            full width. sm and up: one right-aligned row (it wraps when the reject note is open). */}
        {showFooter && (
          <div className="shrink-0 flex flex-col gap-2 border-t border-border/60 bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:flex-wrap sm:items-start sm:justify-end sm:gap-3 sm:px-6 sm:py-3.5 lg:px-8">
            {/* Single-stage verify: one PC/Admin check decides it. */}
            {showVerify && (
              <div className="min-w-0 sm:flex-1 sm:basis-72 sm:max-w-md">
                <TicketVerificationActions
                  isPending={verifyMut.isPending}
                  onApprove={() => verifyMut.mutate({ id: ticket.id, payload: { action: 'APPROVE' } }, { onSuccess: onClose })}
                  onReject={note => verifyMut.mutate({ id: ticket.id, payload: { action: 'REJECT', note } }, { onSuccess: onClose })}
                />
              </div>
            )}
            {statusOptions.length > 0 && (
              <div className="flex w-full sm:w-auto">
                <TicketStatusMenu
                  options={statusOptions}
                  onPick={handlePickStatus}
                  isBusy={updateMut.isPending || statusUpdateMut.isPending}
                  emphasis={showVerify ? 'secondary' : 'primary'}
                />
              </div>
            )}
          </div>
        )}

        <ImageLightbox src={previewImage} onClose={() => setPreviewImage(null)} />

      </SheetContent>

      {/* Mandatory remark for every restricted-status quick change — see the statusActions
          comment above. Deliberately NOT passing `nested` here: this sheet is a shadcn/ui Sheet,
          not the shared Modal that prop was built against, and its Radix Dialog portals outside
          the Sheet's own DOM subtree — with `nested` (modal={false}) the Sheet's own
          dismissable-layer treats a click inside the remark dialog as an outside click and closes
          the whole sheet before the click ever reaches the dialog's submit button, silently
          dropping the status change. A plain, independently-modal dialog (the default) stacks
          correctly on top of the Sheet with no such conflict. */}
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