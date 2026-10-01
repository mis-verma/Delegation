import { useState } from 'react';
import { ShieldCheck, Type, SlidersHorizontal, CalendarDays, User, Trash2, Loader2 } from 'lucide-react';
import {
  useTicketQuery,
  useUpdateTicketMutation,
  useDeleteTicketMutation,
  useAssignableUsersQuery,
  useVerifyTicketMutation,
  useAddTicketStatusUpdateMutation,
  useDepartmentsQuery,
} from './hook';
import { ImageLightbox, ActivityTimeline, IconChip, StatusChip, PriorityChip, DepartmentChip, type StatusChipStatus } from '../../components';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { DetailLabelsField } from '../tags/DetailLabelsField';
import { useAuth } from '../../context/AuthContext';
import { getTicketStatusLabel } from '../../lib/ticketStatusLabel';
import { getInitials } from '../../lib/getInitials';
import { avatarColorClass } from '../../lib/avatarColors';
import { STATUS_OPTIONS, STATUS_UPDATE_OPTIONS } from './detail/detailConstants';
import { PRIORITY_CONFIG } from './ticketDisplay';
import { TicketDetailHeader } from './detail/TicketDetailHeader';
import { VerificationNoteBanner } from '../../components/verificationBanner';
import { TicketDescription } from './detail/TicketDescription';
import { TicketStatusHistory } from './detail/TicketStatusHistory';
import { TicketVerificationActions } from './detail/TicketVerificationActions';
import { TicketStatusMenu } from './detail/TicketStatusMenu';
import { TicketStatusRemarkDialog } from './TicketStatusRemarkDialog';
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
  const canChangeStatus =
    currentUser?.role === "ADMIN" ||
    currentUser?.role === "PC" ||
    currentUser?.role === "MANAGER" ||
    ((currentUser?.role === "AGENT" || currentUser?.role === "USER") &&
      (ticket.assigneeId === currentUser?.id || ticket.userId === currentUser?.id));
      
  const { data: assignableUsers } = useAssignableUsersQuery(ticket.departmentId ?? undefined);
  const { data: departments } = useDepartmentsQuery();
  // The current assignee may sit outside this department's assignable roster (moved, or picked
  // before a department change). Without them in the list the picker showed "Unassigned".
  const assigneeOptions: AssignableUser[] | undefined = ticket.assignee && assignableUsers && !assignableUsers.some(u => u.id === ticket.assignee!.id)
    ? [...assignableUsers, { id: ticket.assignee.id, firstName: ticket.assignee.firstName, lastName: null, email: ticket.assignee.email, role: ticket.assignee.role as Role, departmentId: null }]
    : assignableUsers;
  const departmentName = ticket.departmentId ? departments?.find(d => d.id === ticket.departmentId)?.name : undefined;

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const statusUpdateMut = useAddTicketStatusUpdateMutation(ticket.id);

  const handleDelete = () => {
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
    // Only On Hold asks why. In Progress and Completed (which sends it to PC for approval) are one
    // tap with no pop-up.
    if (next === 'ON_HOLD') setQuickStatusPick(next);
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

  return (
    <Sheet open onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent
        className="sm:max-w-[600px] lg:max-w-[720px] w-full p-0 flex flex-col h-full overflow-hidden font-sans"
      >
        {/* Indeterminate loading bar */}
        {isPending && (
          <div className="absolute top-0 left-0 right-0 z-50 h-[3px] w-full bg-primary-500/15 overflow-hidden">
            <div className="h-full bg-primary-500 w-1/2 rounded-r-full animate-[slide_1.5s_ease-in-out_infinite]" />
          </div>
        )}

        <TicketDetailHeader ticket={ticket} />

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-8 sm:py-6 flex flex-col gap-5 sm:gap-6 custom-scrollbar">
          {/* Title under its own label, with a small round delete button on the label row, same
              layout as the delegation detail sheet. */}
          <section className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3 min-h-8">
              <span className={DETAIL_HEADING_CLASS}>
                <Type size={14} className="text-text-light" />
                Title
              </span>
              {isAdmin && (
                <button
                  type="button"
                  disabled={deleteMut.isPending}
                  onClick={handleDelete}
                  aria-label="Delete ticket"
                  title="Delete ticket"
                  className="flex items-center justify-center size-8 rounded-full text-text-light hover:text-danger hover:bg-danger/10 active:bg-danger/10 disabled:opacity-50 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger/40 [-webkit-tap-highlight-color:transparent]"
                >
                  {deleteMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                </button>
              )}
            </div>
            <SheetTitle className="pr-0 text-lg sm:text-xl font-display font-semibold text-text tracking-tight leading-snug break-words select-text">
              {ticket.title}
            </SheetTitle>
          </section>

          {/* Every property as one wrapping row of icon chips: status, priority, owner, deadline,
              department. Was a 2x2 grid of labelled cells where a long date wrapped onto three
              lines next to its own "Overdue" chip. */}
          <section className="flex flex-col gap-2">
            <span className={DETAIL_HEADING_CLASS}>
              <SlidersHorizontal size={14} className="text-text-light" />
              Details
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={statusChipStatus} label={statusLabel} />
              <PriorityChip meta={PRIORITY_CONFIG[ticket.priority]} />

              {canAssign ? (
                <div title="Assignee" className="flex items-center">
                  <AssigneeField
                    single
                    hideLabel
                    selectedIds={ticket.assigneeId ? [ticket.assigneeId] : []}
                    onChange={ids => updateMut.mutate({ id: ticket.id, payload: { assigneeId: ids[0] ?? null } })}
                    users={assigneeOptions}
                  />
                </div>
              ) : (
                <span title="Assignee" className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border border-border/60 bg-surface text-xs font-semibold text-text">
                  {assigneeName ? (
                    <span className={`flex items-center justify-center size-5 rounded-full text-white text-[9px] font-bold ${avatarColorClass(assigneeName)}`}>
                      {getInitials(assigneeName)}
                    </span>
                  ) : (
                    <span className="flex items-center justify-center size-5 rounded-full bg-surface-hover text-text-light">
                      <User size={11} />
                    </span>
                  )}
                  {assigneeName ?? 'Unassigned'}
                </span>
              )}

              {ticket.tatDueAt && (
                <IconChip
                  icon={CalendarDays}
                  tone={isOverdue ? 'bg-danger' : 'bg-primary-700'}
                  label={`${isOverdue ? 'Delayed · ' : 'Due '}${new Date(ticket.tatDueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
                  title="SLA deadline"
                  className={isOverdue ? 'border-danger/30 text-danger' : undefined}
                />
              )}

              {departmentName && (
                <span title="Department" className="inline-flex">
                  <DepartmentChip name={departmentName} />
                </span>
              )}
            </div>
          </section>

          {/* Same inline label field as the create form; each change saves at once. Editable by
              whoever can reassign the ticket, read-only chips for everyone else. */}
          <DetailLabelsField
            current={ticket.tags ?? []}
            onSave={(tagIds) => labelsMut.mutate({ id: ticket.id, payload: { tagIds } })}
            canCreate={isVerifier}
            readOnly={!canAssign}
            headingClassName={DETAIL_HEADING_CLASS}
          />

          {/* No reviewer picker: PC and Admin verify every ticket by default. Older tickets that
              named reviewers still show them, read-only. */}
          {ticket.reviewers.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck size={15} className="text-text-light shrink-0" />
              <span className="text-text-secondary">
                Reviewers: {ticket.reviewers.map((r) => `${r.firstName}${r.lastName ? ` ${r.lastName}` : ''}`).join(', ')}
              </span>
            </div>
          )}

          <VerificationNoteBanner note={ticket.verificationNote} approved={ticket.status === 'CLOSED'} verifiedBy={ticket.verifiedBy} />

          <TicketDescription description={ticket.description} />

          {/* No standalone attachments/comments UI here (removed by request, same call as
              Delegation's own — TaskDetail.tsx carries the identical reasoning): every status
              change already goes through TicketStatusRemarkDialog below, which takes a mandatory
              remark and optional proof photos, so this sheet already has one place to say
              something and show evidence without a second, separate mechanism duplicating it. */}
          {(ticket.statusUpdates?.length ?? 0) > 0 && (
            <TicketStatusHistory statusUpdates={ticket.statusUpdates} onPreview={setPreviewImage} />
          )}

          {isAdmin && <ActivityTimeline entityType="Ticket" entityId={ticket.id} />}
        </div>

        {showFooter && (
          <div className="shrink-0 flex flex-col gap-3 border-t border-border/60 bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-4">
            {/* Single-stage verify: one PC/Admin check decides it. */}
            {showVerify && (
              <TicketVerificationActions
                isPending={verifyMut.isPending}
                onApprove={() => verifyMut.mutate({ id: ticket.id, payload: { action: 'APPROVE' } })}
                onReject={note => verifyMut.mutate({ id: ticket.id, payload: { action: 'REJECT', note } })}
              />
            )}
            {statusOptions.length > 0 && (
              <div className="flex items-center justify-end">
                <TicketStatusMenu
                  options={statusOptions}
                  onPick={handlePickStatus}
                  isBusy={updateMut.isPending || statusUpdateMut.isPending}
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
                remark,
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