import type { ApprovalBucket } from '../pc/usePcApprovalBuckets';
import type { ApprovalParam } from './work/statsRegistry';

export type ApprovalKind = ApprovalParam;

type ApprovalKinds = Record<ApprovalKind, ApprovalBucket>;

export interface ApprovalFigure {
  value: number;
  kinds?: ApprovalKinds;
  delayed: number;
  href?: string;
  loading: boolean;
  failed: boolean;
}

export const teamApprovalFigure = (bucket: ApprovalBucket, queueHref: string, loading: boolean, failed: boolean, kinds?: ApprovalKinds): ApprovalFigure => ({
  value: bucket.pending,
  kinds,
  delayed: bucket.old,
  href: queueHref,
  loading,
  failed,
});
