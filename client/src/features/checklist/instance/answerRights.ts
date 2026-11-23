import type { Role } from '../../../api/auth';

export interface AnswerRights {
  /** Answers a run they were never assigned to. */
  readonly anyRun: boolean;
  /** Answers stay live while reviewing, with no Edit answers toggle to arm first. */
  readonly liveWhileReviewing: boolean;
  /** Still changes answers once the run is approved and locked. The server allows admins only. */
  readonly whenApproved: boolean;
  /** Takes a question back to unanswered. The server allows admins only. */
  readonly unanswer: boolean;
  /** Gets rotate and enhance in the photo viewer. */
  readonly photoTools: boolean;
}

const NONE: AnswerRights = {
  anyRun: false,
  liveWhileReviewing: false,
  whenApproved: false,
  unanswer: false,
  photoTools: false,
};

const BY_ROLE: Readonly<Partial<Record<Role, AnswerRights>>> = {
  ADMIN: { anyRun: true, liveWhileReviewing: true, whenApproved: true, unanswer: true, photoTools: true },
  PC: { anyRun: true, liveWhileReviewing: true, whenApproved: false, unanswer: false, photoTools: true },
};

export const answerRightsOf = (role: Role | string | null | undefined): AnswerRights =>
  BY_ROLE[role as Role] ?? NONE;
