import type { ReactNode } from 'react';
import { Activity, History, Camera, Eye, Hourglass, Send, ShieldCheck, Undo2, type LucideIcon } from 'lucide-react';
import { isProgressUpdate } from '../../../lib/ticketProgress';
import { UPLOADS_BASE, DETAIL_SECTION_HEADING, DETAIL_SECTION_TILE } from './detailConstants';
import { Avatar } from '../../../components/avatar';
import { CountBadge } from '../../../components/countBadge';
import { IconChip } from '../../../components/iconChip';
import { StatusChip, getStatusChipMeta, type StatusChipStatus } from '../../../components/statusChip';
import { TONE, type ActivityTone } from '../../../components/activityTimeline/activityTones';
import { ROLE_LABEL } from '../../admin/roleBadge';
import type { Ticket, TicketAttachment } from '../../../api/ticket';
import type { Role } from '../../../api/auth';

interface TicketStatusHistoryProps {
  ticket: Ticket;
  departmentName?: string;
  onPreview: (url: string) => void;
}

type Person = { firstName: string; lastName?: string | null; role?: string | null };

interface Step {
  id: string;
  icon: LucideIcon;
  tone: ActivityTone;
  chip: ReactNode;
  who: Person | null;
  whoNote?: string;
  at: string | null;
  remark?: string | null;
  photos?: TicketAttachment[];
  pending?: boolean;
}

const fullName = (p: Person) => `${p.firstName}${p.lastName ? ` ${p.lastName}` : ''}`.trim();

const formatStamp = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const date = d.toLocaleDateString(undefined, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${time}`;
};

const formatGap = (from: string, to: string) => {
  const mins = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000);
  if (!Number.isFinite(mins) || mins < 1) return 'Right away';
  if (mins < 60) return `${mins} min later`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h later`;
  const days = Math.round(hours / 24);
  return `${days}d later`;
};

const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);

const buildSteps = (ticket: Ticket, departmentName?: string): Step[] => {
  const head: Step[] = [
    {
      id: 'raised',
      icon: Send,
      tone: 'primary',
      chip: <IconChip icon={Send} tone="bg-primary-600 dark:bg-primary-400" label="Raised" />,
      who: ticket.raisedBy ?? null,
      at: ticket.createdAt,
    },
  ];

  if (ticket.awaitingHeadApproval && !ticket.declinedAt) {
    head.push({
      id: 'head-waiting',
      icon: Hourglass,
      tone: 'warning',
      chip: <IconChip icon={Hourglass} tone="bg-warning" label="Waiting for head approval" className="border-warning/30 bg-warning/10" labelClassName="text-warning" />,
      who: null,
      whoNote: departmentName ? `${departmentName} head will decide` : 'The department head will decide',
      at: null,
      pending: true,
    });
  } else if (ticket.assignmentApprovedAt) {
    head.push({
      id: 'head-approved',
      icon: ShieldCheck,
      tone: 'success',
      chip: <IconChip icon={ShieldCheck} tone="bg-success" label="Approved by head" className="border-success/30 bg-success/10" labelClassName="text-success" />,
      who: ticket.assignmentApprover ?? null,
      at: ticket.assignmentApprovedAt,
    });
  }

  const later: Step[] = (ticket.statusUpdates ?? []).map((su) => {
    if (isProgressUpdate(su)) {
      return {
        id: su.id,
        icon: Activity,
        tone: 'warning',
        chip: <IconChip icon={Activity} tone="bg-warning" label="Work update" className="border-warning/30 bg-warning/10" labelClassName="text-warning" />,
        who: su.changedByUser,
        at: su.createdAt,
        remark: su.remark,
        photos: su.photos,
      } satisfies Step;
    }
    const sentBack = su.fromStatus === 'PENDING_APPROVAL' && su.toStatus === 'IN_PROGRESS';
    const completed = su.toStatus === 'PENDING_APPROVAL';
    const key = su.toStatus.toLowerCase() as StatusChipStatus;
    const meta = getStatusChipMeta(key);
    const label = sentBack ? 'Sent back to work' : completed ? 'Marked completed' : undefined;
    return {
      id: su.id,
      icon: sentBack ? Undo2 : meta.icon,
      tone: sentBack ? 'danger' : completed ? 'primary' : key === 'on_hold' ? 'muted' : key === 'in_progress' ? 'warning' : 'info',
      chip: <StatusChip status={key} label={label} icon={sentBack ? Undo2 : undefined} />,
      who: su.changedByUser,
      at: su.createdAt,
      remark: su.remark,
      photos: su.photos,
    } satisfies Step;
  });

  if (ticket.hodApprovedAt) {
    later.push({
      id: 'work-head-approved',
      icon: ShieldCheck,
      tone: 'success',
      chip: <IconChip icon={ShieldCheck} tone="bg-success" label="Head approved the work" className="border-success/30 bg-success/10" labelClassName="text-success" />,
      who: ticket.hodApprover ?? null,
      at: ticket.hodApprovedAt,
    });
  }

  if (ticket.declinedAt) {
    later.push({
      id: 'declined',
      icon: getStatusChipMeta('declined').icon,
      tone: 'danger',
      chip: <StatusChip status="declined" />,
      who: ticket.decliner ?? null,
      at: ticket.declinedAt,
      remark: ticket.declineReason,
    });
  } else if (ticket.status === 'CLOSED' && (ticket.verifiedAt ?? ticket.closedAt)) {
    later.push({
      id: 'closed',
      icon: getStatusChipMeta('closed').icon,
      tone: 'success',
      chip: <StatusChip status="closed" label="Approved and closed" />,
      who: ticket.verifier ?? null,
      at: (ticket.verifiedAt ?? ticket.closedAt) as string,
      remark: ticket.verificationNote,
    });
  }

  later.sort((a, b) => time(a.at) - time(b.at));
  return [...head, ...later];
};

export const TicketStatusHistory = ({ ticket, departmentName, onPreview }: TicketStatusHistoryProps) => {
  const steps = buildSteps(ticket, departmentName);
  const nowIndex = steps.length - 1;

  return (
    <section className="flex flex-col gap-3 min-w-0">
      <h3 className={DETAIL_SECTION_HEADING}>
        <span className={DETAIL_SECTION_TILE} aria-hidden="true"><History size={14} strokeWidth={2.25} /></span>
        Status history
        <CountBadge count={steps.length} max={99} label={`${steps.length} steps`} />
      </h3>

      <ol className="relative flex flex-col gap-2 pl-11 before:absolute before:bottom-6 before:left-[15px] before:top-6 before:w-0.5 before:rounded-full before:bg-border">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const latest = i === nowIndex;
          const previous = i > 0 ? steps[i - 1] : null;
          const gap = previous?.at && step.at ? formatGap(previous.at, step.at) : null;
          const name = step.who ? fullName(step.who) : null;
          const roleLabel = step.who?.role ? ROLE_LABEL[step.who.role as Role] : null;

          return (
            <li key={step.id} className="relative">
              <span
                className={`absolute -left-11 top-2.5 z-10 flex size-8 items-center justify-center rounded-full text-white ring-4 ring-surface ${step.pending ? 'bg-surface-hover text-warning border border-dashed border-warning/60' : TONE[step.tone]}`}
                aria-hidden
              >
                <Icon size={14} strokeWidth={2.5} />
              </span>

              <div className={`flex flex-col gap-2 rounded-xl border px-3.5 py-2.5 ${step.pending ? 'border-dashed border-warning/40 bg-warning/5' : latest ? 'border-primary-500/30 bg-surface' : 'border-border/60 bg-surface-hover/30'}`}>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="t-meta font-display font-semibold text-text-light tabular-nums">Step {i + 1}</span>
                    {step.chip}
                    {latest && !step.pending && (
                      <span className="inline-flex h-5 items-center rounded-full bg-primary-500/10 px-2 t-meta font-display font-semibold text-primary-700 dark:text-primary-300">Now</span>
                    )}
                  </div>
                  {step.at && (
                    <time dateTime={step.at} className="t-meta font-display font-medium text-text-muted tabular-nums">
                      {formatStamp(step.at)}
                    </time>
                  )}
                </div>

                {(name || step.whoNote || gap) && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {name && (
                      <span className="inline-flex min-w-0 items-center gap-1.5 t-meta font-display font-semibold text-text">
                        <Avatar name={name} size="xs" />
                        <span className="truncate">{name}</span>
                        {roleLabel && <span className="font-medium text-text-muted">· {roleLabel}</span>}
                      </span>
                    )}
                    {step.whoNote && <span className="t-meta font-display font-medium text-warning">{step.whoNote}</span>}
                    {gap && <span className="t-meta font-display font-medium text-text-light">{gap}</span>}
                  </div>
                )}

                {step.remark && (
                  <p className="rounded-lg border border-border/60 bg-surface px-2.5 py-1.5 t-meta text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
                    {step.remark}
                  </p>
                )}

                {step.photos && step.photos.length > 0 && (
                  <div className="grid grid-cols-4 gap-1.5 max-w-xs">
                    {step.photos.map((photo) => {
                      const imageUrl = `${UPLOADS_BASE}${photo.url}`;
                      return (
                        <button
                          key={photo.id}
                          type="button"
                          onClick={() => onPreview(imageUrl)}
                          className="group/photo relative aspect-square w-full rounded-md border border-border/60 overflow-hidden bg-surface-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                          aria-label={photo.captureMethod === 'LIVE' ? 'Open photo taken with the camera' : 'Open photo'}
                        >
                          <img src={imageUrl} alt="Proof photo" loading="lazy" className="size-full object-cover" />
                          {photo.captureMethod === 'LIVE' && (
                            <span className="absolute bottom-0.5 left-0.5 flex size-4 items-center justify-center rounded bg-black/55 text-white" title="Taken with the camera">
                              <Camera size={10} aria-hidden />
                            </span>
                          )}
                          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover/photo:opacity-100 transition-opacity duration-200 flex items-center justify-center text-white" aria-hidden>
                            <Eye size={16} strokeWidth={2.5} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
