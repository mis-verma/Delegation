import type { Ticket } from '../../../api/ticket';

export type TatStageKey = 'hod' | 'user' | 'total';

export interface TatStage {
  key: TatStageKey;
  label: string;
  hint: string;
  ms: number;
  running: boolean;
  late: boolean;
  by: string | null;
  note: string;
}

type StageFields = Pick<Ticket,
  'createdAt' | 'closedAt' | 'status' | 'submittedAt' | 'tatDueAt' | 'awaitingHeadApproval'
  | 'claimOpenedAt' | 'claimedAt' | 'declinedAt' | 'assignmentApprovedAt' | 'assignmentApprover'
  | 'headClaimedAt' | 'headClaimer' | 'assignee'>;

const at = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
};

const span = (start: number, end: number | null, now: number) => Math.max(0, (end ?? now) - start);

export const ticketTatStages = (ticket: StageFields, now: number): TatStage[] => {
  const created = at(ticket.createdAt) ?? now;
  const closed = at(ticket.closedAt);
  const handedIn = at(ticket.submittedAt);
  const due = at(ticket.tatDueAt);
  const stages: TatStage[] = [];

  const assigned = at(ticket.assignmentApprovedAt) ?? at(ticket.declinedAt);
  if (assigned !== null || ticket.awaitingHeadApproval) {
    const headClaimed = at(ticket.headClaimedAt);
    stages.push({
      key: 'hod',
      label: 'Head',
      hint: 'From raised to the department head assigning it',
      ms: span(created, assigned, now),
      running: assigned === null,
      late: false,
      by: ticket.assignmentApprover?.firstName ?? ticket.headClaimer?.firstName ?? null,
      note: assigned === null
        ? headClaimed === null ? 'Waiting for the head' : 'Head is deciding'
        : 'Assigned',
    });
  }

  const claimed = at(ticket.claimedAt);
  const offered = at(ticket.claimOpenedAt);
  if (claimed !== null || offered !== null) {
    const end = closed ?? handedIn;
    const finished = end ?? now;
    stages.push({
      key: 'user',
      label: 'Person',
      hint: 'From the person claiming it to handing it in',
      ms: claimed === null ? 0 : span(claimed, end, now),
      running: claimed !== null && end === null,
      late: due !== null && finished > due,
      by: claimed !== null ? ticket.assignee?.firstName ?? null : null,
      note: claimed === null ? 'Nobody has claimed it' : end === null ? 'Working on it' : closed ? 'Closed' : 'Handed in',
    });
  }

  stages.push({
    key: 'total',
    label: 'Total',
    hint: 'From when the ticket was raised',
    ms: span(created, closed ?? at(ticket.declinedAt), now),
    running: closed === null && ticket.status !== 'CLOSED',
    late: false,
    by: null,
    note: closed === null ? 'Still open' : 'Closed',
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
