const HOUR_MS = 3_600_000

const readHodTargetHours = (): number => {
  const raw = Number(process.env.TICKET_HOD_TAT_HOURS)
  return Number.isFinite(raw) && raw > 0 ? raw : 4
}

export const HOD_TAT_HOURS = readHodTargetHours()

export type TatLeg = {
  ms: number
  running: boolean
  breached: boolean
  targetMs: number | null
}

export type HodLegFields = {
  createdAt: Date | null
  assignmentApprovedAt: Date | null
  declinedAt: Date | null
  awaitingHeadApproval: boolean
}

export type UserLegFields = {
  claimedAt: Date | null
  submittedAt: Date | null
  closedAt: Date | null
  tatDueAt: Date | null
}

const spanMs = (start: Date, end: Date | null, now: Date): number => Math.max(0, (end ?? now).getTime() - start.getTime())

export const hodTatLeg = (ticket: HodLegFields, now: Date): TatLeg | null => {
  const end = ticket.assignmentApprovedAt ?? ticket.declinedAt
  if (!ticket.createdAt) return null
  if (!end && !ticket.awaitingHeadApproval) return null
  const targetMs = HOD_TAT_HOURS * HOUR_MS
  const ms = spanMs(ticket.createdAt, end, now)
  return { ms, running: end === null, breached: ms > targetMs, targetMs }
}

export const userTatLeg = (ticket: UserLegFields, now: Date): TatLeg | null => {
  if (!ticket.claimedAt) return null
  const end = ticket.closedAt ?? ticket.submittedAt
  const ms = spanMs(ticket.claimedAt, end, now)
  const targetMs = ticket.tatDueAt ? Math.max(0, ticket.tatDueAt.getTime() - ticket.claimedAt.getTime()) : null
  const finished = end ?? now
  return { ms, running: end === null, breached: !!ticket.tatDueAt && finished > ticket.tatDueAt, targetMs }
}

export type TatRow = { people: number; hodMs: number[]; userMs: number[]; hodBreaches: number; userBreaches: number }

export const averageMs = (values: readonly number[]): number | null =>
  values.length === 0 ? null : Math.round(values.reduce((total, v) => total + v, 0) / values.length)

export const breachPct = (breaches: number, measured: number): number | null =>
  measured === 0 ? null : Math.round((breaches / measured) * 1000) / 10
