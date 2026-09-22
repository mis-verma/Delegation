import { useState } from 'react';
import { User, ShieldCheck } from 'lucide-react';
import {
  useTicketQuery,
  useUpdateTicketMutation,
  useDeleteTicketMutation,
  useAssignableUsersQuery,
  useVerifyTicketMutation,
  useAddTicketStatusUpdateMutation,
} from './hook';
import { ImageLightbox, ActivityTimeline, type DropdownAction } from '../../components';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useAuth } from '../../context/AuthContext';
import { getTicketStatusLabel } from '../../lib/ticketStatusLabel';
import { STATUS_OPTIONS, STATUS_CONFIG } from './detail/detailConstants';
import { TicketDetailHeader } from './detail/TicketDetailHeader';
import { TicketQuickAttributes } from './detail/TicketQuickAttributes';
import { VerificationNoteBanner } from '../../components/verificationBanner';
import { TicketDescription } from './detail/TicketDescription';
import { TicketStatusHistory } from './detail/TicketStatusHistory';
import { TicketStatusUpdatePanel } from './detail/TicketStatusUpdatePanel';
import { TicketVerificationActions } from './detail/TicketVerificationActions';
import { TicketDetailFooter } from './detail/TicketDetailFooter';
import { TicketStatusRemarkDialog } from './TicketStatusRemarkDialog';
import { ReviewersField } from '../reviewers/ReviewersField';
import { RESTRICTED_STATUSES, type Ticket, type RestrictedStatus, type CaptureMethod } from '../../api/ticket';

interface TicketDetailProps {
  ticket: Ticket;
  onClose: () => void;
}

export const TicketDetail = ({ ticket: initialTicket, onClose }: TicketDetailProps) => {
  const { data: fresh, isPending } = useTicketQuery(initialTicket.id);
  const ticket = fresh ?? initialTicket;
  
  const updateMut = useUpdateTicketMutation();
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
      
  const selectableStatuses = isVerifier ? STATUS_OPTIONS : STATUS_OPTIONS.filter(s => s.value !== 'CLOSED');

  const { data: assignableUsers } = useAssignableUsersQuery(ticket.departmentId ?? undefined);

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [statusPick, setStatusPick] = useState<RestrictedStatus | null>(null);
  const [statusRemark, setStatusRemark] = useState('');
  const [statusPhotos, setStatusPhotos] = useState<File[]>([]);
  const [statusCaptureMethod, setStatusCaptureMethod] = useState<CaptureMethod>('GALLERY');
  const statusUpdateMut = useAddTicketStatusUpdateMutation(ticket.id);

  const addStatusPhotos = (files: FileList | null, method: CaptureMethod) => {
    if (!files || !files.length) return;
    setStatusPhotos(prev => [...prev, ...Array.from(files)]);
    setStatusCaptureMethod(method);
  };

  const handleSubmitStatusUpdate = () => {
    if (!statusPick || !statusRemark.trim()) return;
    statusUpdateMut.mutate(
      {
        status: statusPick,
        remark: statusRemark.trim(),
        captureMethod: statusPhotos.length ? statusCaptureMethod : undefined,
        files: statusPhotos,
      },
      { onSuccess: () => { setStatusPick(null); setStatusRemark(''); setStatusPhotos([]); } },
    );
  };

  const handleDelete = () => {
    deleteMut.mutate(ticket.id, { onSuccess: onClose });
  };

  const isOverdue = ticket.isOverdue && ticket.status !== 'CLOSED';

  // This quick dropdown is the verifier-only path to change status (the remark-required "Update
  // Status" panel above only renders for non-verifiers). It used to fire every status instantly
  // except On Hold — so a verifier moving straight to In Progress or In Review from here left no
  // remark at all, while the exact same move made by dragging a board card (useTicketStatusMove)
  // or from the non-verifier panel both require one. Every RESTRICTED_STATUSES target now goes
  // through the same TicketStatusRemarkDialog those two already use, via the richer
  // statusUpdateMut (remark + optional photos) the non-verifier panel already posts through —
  // one gate, everywhere a ticket's status can change, not just the one status someone remembered
  // to special-case.
  const [quickStatusPick, setQuickStatusPick] = useState<RestrictedStatus | null>(null);
  const [quickStatusPhotos, setQuickStatusPhotos] = useState<File[]>([]);
  const [quickStatusCaptureMethod, setQuickStatusCaptureMethod] = useState<CaptureMethod>('GALLERY');

  const addQuickStatusPhotos = (files: FileList | null, method: CaptureMethod) => {
    if (!files || !files.length) return;
    setQuickStatusPhotos(prev => [...prev, ...Array.from(files)]);
    setQuickStatusCaptureMethod(method);
  };

  const statusActions: DropdownAction[] = selectableStatuses.map(s => ({
    label: s.label,
    onClick: () =>
      (RESTRICTED_STATUSES as readonly string[]).includes(s.value)
        ? setQuickStatusPick(s.value as RestrictedStatus)
        : updateMut.mutate({ id: ticket.id, payload: { status: s.value } }),
  }));
  
  const statusStyle = STATUS_CONFIG[ticket.status];
  const statusLabel = getTicketStatusLabel(
    ticket.status,
    currentUser?.role,
    STATUS_OPTIONS.find(s => s.value === ticket.status)?.label ?? ticket.status,
  );
  const statusBadgeClass = `${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`;
  const assigneeActions: DropdownAction[] = [
    { label: 'Unassigned', onClick: () => updateMut.mutate({ id: ticket.id, payload: { assigneeId: null } }), icon: User },
    ...(assignableUsers ?? []).map(u => ({
      label: `${u.firstName} ${u.lastName ?? ''}`.trim(),
      onClick: () => updateMut.mutate({ id: ticket.id, payload: { assigneeId: u.id } }),
      icon: User,
    })),
  ];

  return (
    <Sheet open onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent
        className="sm:max-w-[600px] lg:max-w-[720px] w-full p-0 flex flex-col h-full overflow-hidden font-sans"
      >
        {/* Indeterminate loading bar */}
        {isPending && (
          <div className="absolute top-0 left-0 right-0 z-50 h-[3px] w-full bg-primary-50 overflow-hidden">
            <div className="h-full bg-primary-500 w-1/2 rounded-r-full animate-[slide_1.5s_ease-in-out_infinite]" />
          </div>
        )}

        {/* Sticky Header */}
        <div className="z-10 bg-surface border-b border-border shrink-0">
          <TicketDetailHeader ticket={ticket} />
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8 flex flex-col gap-8 custom-scrollbar">

          <div className="flex flex-col gap-5">
            <TicketQuickAttributes
              ticket={ticket}
              currentUserRole={currentUser?.role}
              canAssign={canAssign}
              assigneeActions={assigneeActions}
              isOverdue={isOverdue}
            />
            <VerificationNoteBanner note={ticket.verificationNote} approved={ticket.status === 'CLOSED'} verifiedBy={ticket.verifiedBy} />

            {/* Reviewer assignment is the same routing-authority decision as reassigning who owns
                this ticket, so it's gated behind the same canAssign check. Someone without that
                authority still sees who's named, just not an editable picker. */}
            {canAssign ? (
              <ReviewersField
                departmentId={ticket.departmentId ?? undefined}
                storeId={ticket.storeId ?? undefined}
                selected={ticket.reviewers.map((r) => r.id)}
                onChange={(ids) => updateMut.mutate({ id: ticket.id, payload: { reviewerIds: ids } })}
              />
            ) : ticket.reviewers.length > 0 && (
              <div className="flex items-center gap-2.5 text-sm font-display">
                <ShieldCheck size={15} className="text-text-light shrink-0" />
                <span className="text-text-secondary">
                  Reviewers: {ticket.reviewers.map((r) => `${r.firstName}${r.lastName ? ` ${r.lastName}` : ''}`).join(', ')}
                </span>
              </div>
            )}
          </div>

          {/* Each divider is paired with the section right after it, not rendered on its own —
              Description and Status History both go blank on a fresh ticket (no description yet,
              no status changes yet), and a static divider with nothing below it read as a stray
              line dividing the page from empty space rather than separating two real sections. */}
          {!!ticket.description?.trim() && (
            <>
              <div className="h-px w-full bg-border" />
              <TicketDescription description={ticket.description} />
            </>
          )}

          {(ticket.statusUpdates?.length ?? 0) > 0 && (
            <>
              <div className="h-px w-full bg-border" />
              <TicketStatusHistory statusUpdates={ticket.statusUpdates} onPreview={setPreviewImage} />
            </>
          )}

          {(currentUser?.role === 'ADMIN' || currentUser?.role === 'PC') && (
            <>
              <div className="h-px w-full bg-border" />
              <ActivityTimeline entityType="Ticket" entityId={ticket.id} />
            </>
          )}
        </div>

        {/* Pinned Action Panels & Footer */}
        <div className="relative z-20 flex flex-col shrink-0 border-t border-border bg-surface pb-safe">
          {canChangeStatus && !isVerifier && ticket.status !== 'CLOSED' && ticket.status !== 'PENDING_APPROVAL' && (
            <div className="px-5 sm:px-8 py-4 border-b border-border/60">
              <TicketStatusUpdatePanel
                statusPick={statusPick}
                onPickStatus={setStatusPick}
                statusRemark={statusRemark}
                onRemarkChange={setStatusRemark}
                statusPhotos={statusPhotos}
                onRemovePhoto={i => setStatusPhotos(prev => prev.filter((_, idx) => idx !== i))}
                onAddPhotos={addStatusPhotos}
                onSubmit={handleSubmitStatusUpdate}
                isSubmitting={statusUpdateMut.isPending}
                submitErrorMessage={statusUpdateMut.isError
                  ? (statusUpdateMut.error instanceof Error ? statusUpdateMut.error.message : 'Failed to update status.')
                  : null}
              />
            </div>
          )}

          {/* Single-stage verify: one PC/ADMIN/manager/reviewer check decides the whole thing —
              the old two-stage QC-then-approval split is gone. */}
          {isVerifier && ticket.status === 'PENDING_APPROVAL' && (
            <div className="px-5 sm:px-8 py-4 border-b border-border/60 bg-status-approve/10">
              <TicketVerificationActions
                isPending={verifyMut.isPending}
                onApprove={() => verifyMut.mutate({ id: ticket.id, payload: { action: 'APPROVE' } })}
                onReject={note => verifyMut.mutate({ id: ticket.id, payload: { action: 'REJECT', note } })}
              />
            </div>
          )}

          <div className="px-5 sm:px-8 py-4">
            <TicketDetailFooter
              isAdmin={isAdmin}
              onDelete={handleDelete}
              isDeleting={deleteMut.isPending}
              isVerifier={isVerifier}
              statusActions={statusActions}
              statusLabel={statusLabel}
              statusBadgeClass={statusBadgeClass}
            />
          </div>
        </div>

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