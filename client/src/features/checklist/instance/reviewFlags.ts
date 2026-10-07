import { answerVerdict } from '../checklistCompliance';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

// What a reviewer should look at on one question. One definition shared by the review panel (which
// splits "Needs a look" from "Everything else") and the queue rows (which count the same things as
// risk chips), so a row never says "2 bad answers" while the panel shows three.
export interface ItemFlags {
  /** Answered outside its acceptable rule (and not already counted as a send-back). */
  bad: boolean;
  /** Needs photos and has fewer than that. */
  missingPhotos: boolean;
  /** A reviewer already sent this question back at least once (and has not waived it since). */
  sentBack: boolean;
  /** A reviewer excused this question: it no longer counts against compliance. */
  waived: boolean;
  /** The checklist author marked this question critical. */
  critical: boolean;
  /** Critical and its verdict is bad. */
  criticalFailed: boolean;
  /** Sent back before and done again since. */
  fixed: boolean;
  /** Any reason for the reviewer to open this question first. */
  needsLook: boolean;
}

export const itemFlags = (item: ChecklistInstanceItem): ItemFlags => {
  const verdict = answerVerdict(item);
  const waived = !!item.waivedAt;
  const sentBack = item.sendBackCount > 0 && !waived;
  const bad = verdict === 'bad' && !sentBack;
  const missingPhotos = !item.isNotApplicable && item.requiredImageCount > 0 && item.images.length < item.requiredImageCount;
  const critical = item.isCritical === true;
  return {
    bad,
    missingPhotos,
    sentBack,
    waived,
    critical,
    criticalFailed: critical && verdict === 'bad',
    fixed: sentBack && item.isDone,
    needsLook: bad || missingPhotos || sentBack,
  };
};

// Lower sorts first: a critical failure, then a bad answer, then missing photos, then a send-back.
export const needsLookRank = (flags: ItemFlags): number =>
  flags.criticalFailed ? 0 : flags.bad ? 1 : flags.missingPhotos ? 2 : 3;
