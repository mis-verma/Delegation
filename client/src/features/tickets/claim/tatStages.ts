import type { Ticket } from '../../../api/ticket';
import { isAwaitingClaim } from './ticketClaim';

export type TatStageKey = 'head' | 'member' | 'total';

export interface TatStage {
  key: TatStageKey;
  label: string;
  hint: string;
  ms: number;
  running: boolean;
  by: string | null;
}

type StageFields = Pick<Ticket, 'createdAt' | 'closedAt' | 'status' | 'assigneeId' | 'awaitingHeadApproval' | 'claimOpenedAt' | 'claimedAt' | 'declinedAt' | 'headClaimedAt' | 'headClaimer' | 'assignee'>;

const at = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
};

const span = (start: number, end: number | null, now: number) => Math.max(0, (end ?? now) - start);

export const ticketTatStages = (ticket: StageFields, now: number): TatStage[] => {
  const created = at(ticket.createdAt) ?? now;
  const closed = ticket.status === 'CLOSED' ? at(ticket.closedAt) ?? at(ticket.declinedAt) : null;
  const stages: TatStage[] = [];

  const headClaimed = at(ticket.headClaimedAt);
  if (headClaimed !== null || ticket.awaitingHeadApproval) {
    const end = headClaimed ?? closed;
    stages.push({
      key: 'head',
      label: 'Head claim',
      hint: 'From raised to the department head claiming it',
      ms: span(created, end, now),
      running: end === null,
      by: ticket.headClaimer?.firstName ?? null,
    });
  }

  const offered = at(ticket.claimOpenedAt);
  const claimed = at(ticket.claimedAt);
  const waiting = isAwaitingClaim(ticket);
  if (offered !== null && (claimed !== null || waiting)) {
    stages.push({
      key: 'member',
      label: 'Team claim',
      hint: 'From being given to the team to someone claiming it',
      ms: span(offered, claimed, now),
      running: claimed === null,
      by: claimed !== null ? ticket.assignee?.firstName ?? null : null,
    });
  }

  stages.push({
    key: 'total',
    label: 'Total time',
    hint: 'From when the ticket was raised',
    ms: span(created, closed, now),
    running: closed === null,
    by: null,
  });
  return stages;
};

export const formatTatSpan = (ms: number): string => {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'Under a minute';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`;
};
