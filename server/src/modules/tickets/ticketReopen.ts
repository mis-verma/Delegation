export type ReopenBefore = {
  assigneeId: string | null
  reopenedAssigneeId: string | null
  sameAssigneeReopens: number
  reopenCount: number
}

export type ReopenPatch = {
  reopenCount: number
  reopenedAssigneeId: string | null
  sameAssigneeReopens: number
}

export const reopenPatch = (before: ReopenBefore, nextAssigneeId: string | null | undefined): ReopenPatch => {
  const assignee = nextAssigneeId === undefined ? before.assigneeId : nextAssigneeId
  const backToSamePerson = !!assignee && (assignee === before.assigneeId || assignee === before.reopenedAssigneeId)
  return {
    reopenCount: before.reopenCount + 1,
    reopenedAssigneeId: assignee ?? before.assigneeId ?? before.reopenedAssigneeId,
    sameAssigneeReopens: backToSamePerson ? before.sameAssigneeReopens + 1 : before.sameAssigneeReopens,
  }
}

export type AssignFields = { reopenedAssigneeId: string | null; sameAssigneeReopens: number; reopenCount: number }

export const reassignPatch = (before: AssignFields, nextAssigneeId: string | null): Pick<ReopenPatch, 'sameAssigneeReopens'> | null => {
  if (before.reopenCount === 0 || !before.reopenedAssigneeId) return null
  if (nextAssigneeId !== before.reopenedAssigneeId) return null
  if (before.sameAssigneeReopens > 0) return null
  return { sameAssigneeReopens: before.sameAssigneeReopens + 1 }
}
