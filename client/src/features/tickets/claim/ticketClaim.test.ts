import { describe, expect, it } from 'vitest';
import { canClaim, canHeadDecide, isAwaitingAssigneeClaim, isClaimable, tatText } from './ticketClaim';
import type { Ticket } from '../../../api/ticket';

const open = {
  claimOpenedAt: '2026-03-01T00:00:00Z',
  assigneeId: null,
  status: 'OPEN',
  awaitingHeadApproval: false,
  declinedAt: null,
  claimedAt: null,
  departmentId: 'd1',
  headClaimedBy: null,
} as unknown as Ticket;

const t = (patch: Partial<Ticket>) => ({ ...open, ...patch }) as Ticket;

const member = { id: 'u1', role: 'USER' as const, departmentId: 'd1' };
const outsider = { id: 'u2', role: 'USER' as const, departmentId: 'd9' };
const head = { id: 'h1', role: 'MANAGER' as const, departmentId: 'd1' };
const admin = { id: 'a1', role: 'ADMIN' as const, departmentId: null };

describe('who may claim a ticket', () => {
  it('lets anyone in the department take an open one', () => {
    expect(isClaimable(open)).toBe(true);
    expect(canClaim(member, open)).toBe(true);
  });

  it('keeps it away from another department', () => {
    expect(canClaim(outsider, open)).toBe(false);
  });

  it('gives a named ticket only to that person', () => {
    const given = t({ assigneeId: 'u1' });
    expect(isAwaitingAssigneeClaim(given)).toBe(true);
    expect(canClaim(member, given)).toBe(true);
    expect(canClaim({ id: 'u3', role: 'USER', departmentId: 'd1' }, given)).toBe(false);
  });

  it('never offers a claim on work that is not open for it', () => {
    expect(canClaim(member, t({ awaitingHeadApproval: true }))).toBe(false);
    expect(canClaim(member, t({ declinedAt: '2026-03-02T00:00:00Z' }))).toBe(false);
    expect(canClaim(member, t({ status: 'CLOSED' }))).toBe(false);
    expect(canClaim(member, t({ claimOpenedAt: null }))).toBe(false);
    expect(canClaim(null, open)).toBe(false);
    expect(canClaim({ id: 'o', role: 'OWNER', departmentId: 'd1' }, open)).toBe(false);
  });
});

describe('who may take charge as the head', () => {
  const waiting = t({ awaitingHeadApproval: true });

  it('lets the head of that department decide', () => {
    expect(canHeadDecide(head, waiting)).toBe(true);
  });

  it('lets Admin and PC step in anywhere', () => {
    expect(canHeadDecide(admin, waiting)).toBe(true);
  });

  it('keeps out heads of other departments and ordinary members', () => {
    expect(canHeadDecide({ id: 'h2', role: 'MANAGER', departmentId: 'd9' }, waiting)).toBe(false);
    expect(canHeadDecide(member, waiting)).toBe(false);
  });

  it('stops a second head once one has claimed it', () => {
    const taken = t({ awaitingHeadApproval: true, headClaimedBy: 'h1' });
    expect(canHeadDecide(head, taken)).toBe(true);
    expect(canHeadDecide({ id: 'h3', role: 'SENIOR', departmentId: 'd1' }, taken)).toBe(false);
    expect(canHeadDecide(admin, taken)).toBe(true);
  });

  it('says no once it is decided or declined', () => {
    expect(canHeadDecide(head, open)).toBe(false);
    expect(canHeadDecide(head, t({ awaitingHeadApproval: true, declinedAt: '2026-03-02T00:00:00Z' }))).toBe(false);
  });
});

describe('time left in words', () => {
  it('reads naturally', () => {
    expect(tatText(1)).toBe('1 hour');
    expect(tatText(4)).toBe('4 hours');
    expect(tatText(24)).toBe('1 day');
    expect(tatText(72)).toBe('3 days');
    expect(tatText(null)).toBeNull();
    expect(tatText(0)).toBeNull();
  });
});
