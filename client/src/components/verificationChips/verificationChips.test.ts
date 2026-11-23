import { describe, it, expect } from 'vitest';
import { APPROVAL_STATUS_CONFIG, FALLBACK_APPROVAL_CONFIG } from './constants';

describe('APPROVAL_STATUS_CONFIG (O(1) Status Map)', () => {
  it('resolves APPROVED to verified styling with check/shield', () => {
    const approved = APPROVAL_STATUS_CONFIG['APPROVED'];
    expect(approved).toBeDefined();
    expect(approved.label).toBe('Verified');
    expect(approved.tone).toContain('emerald');
  });

  it('resolves PENDING_APPROVAL and PENDING to pending configuration', () => {
    const pendingApproval = APPROVAL_STATUS_CONFIG['PENDING_APPROVAL'];
    const pending = APPROVAL_STATUS_CONFIG['PENDING'];
    expect(pendingApproval).toBeDefined();
    expect(pending).toBeDefined();
    expect(pendingApproval.label).toBe('Pending approval');
    expect(pendingApproval.tone).toContain('amber');
  });

  it('resolves REJECTED, CORRECTION_REQUESTED, and SENT_BACK', () => {
    const rejected = APPROVAL_STATUS_CONFIG['REJECTED'];
    const correction = APPROVAL_STATUS_CONFIG['CORRECTION_REQUESTED'];
    const sentBack = APPROVAL_STATUS_CONFIG['SENT_BACK'];
    expect(rejected).toBeDefined();
    expect(correction).toBeDefined();
    expect(sentBack).toBeDefined();
    expect(rejected.tone).toContain('rose');
    expect(correction.tone).toContain('rose');
  });

  it('resolves SELF_RECHECK_WINDOW to sky blue configuration', () => {
    const recheck = APPROVAL_STATUS_CONFIG['SELF_RECHECK_WINDOW'];
    expect(recheck).toBeDefined();
    expect(recheck.label).toBe('Self-recheck open');
    expect(recheck.tone).toContain('sky');
  });

  it('resolves NOT_SUBMITTED and READY_TO_SUBMIT', () => {
    const notSubmitted = APPROVAL_STATUS_CONFIG['NOT_SUBMITTED'];
    const ready = APPROVAL_STATUS_CONFIG['READY_TO_SUBMIT'];
    expect(notSubmitted).toBeDefined();
    expect(ready).toBeDefined();
    expect(notSubmitted.label).toBe('Not submitted');
    expect(ready.label).toBe('Ready to submit');
  });

  it('is frozen for strict immutability and O(1) performance', () => {
    expect(Object.isFrozen(APPROVAL_STATUS_CONFIG)).toBe(true);
    expect(Object.isFrozen(FALLBACK_APPROVAL_CONFIG)).toBe(true);
  });
});
