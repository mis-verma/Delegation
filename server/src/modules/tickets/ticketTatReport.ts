import { sql, type SQL } from "drizzle-orm"
import { db } from "../../config/db.js"
import { resolveReportRange, utcSql } from "../checklistInstances/checklistReportRange.js"
import { round1 } from "./ticketShared.js"
import { HOD_TAT_HOURS } from "./ticketTat.js"

export type TatLegNumbers = {
  measured: number
  avgHours: number | null
  breaches: number
  breachPct: number | null
}

export type TatLegRow = {
  id: string
  name: string
  departmentName: string | null
  hod: TatLegNumbers
  user: TatLegNumbers
}

export type TatLegReport = {
  from: string
  to: string
  hodTargetHours: number
  people: TatLegRow[]
  departments: TatLegRow[]
}

type Agg = { measured: number; avgHours: number | null; breaches: number }
type Row = Record<string, unknown>

const emptyLeg = (): TatLegNumbers => ({ measured: 0, avgHours: null, breaches: 0, breachPct: null })

const legOf = (agg: Agg | undefined): TatLegNumbers => {
  if (!agg || agg.measured === 0) return emptyLeg()
  return {
    measured: agg.measured,
    avgHours: agg.avgHours === null ? null : round1(agg.avgHours),
    breaches: agg.breaches,
    breachPct: round1((agg.breaches / agg.measured) * 100),
  }
}

const readAgg = (rows: Row[]): Map<string, Agg & { name: string; departmentName: string | null }> => {
  const out = new Map<string, Agg & { name: string; departmentName: string | null }>()
  for (const row of rows) {
    const id = row.id == null ? "" : String(row.id)
    if (!id) continue
    out.set(id, {
      name: String(row.name ?? "Unknown"),
      departmentName: row.departmentName == null ? null : String(row.departmentName),
      measured: Number(row.measured ?? 0),
      avgHours: row.avgHours == null ? null : Number(row.avgHours),
      breaches: Number(row.breaches ?? 0),
    })
  }
  return out
}

const merge = (
  hod: Map<string, Agg & { name: string; departmentName: string | null }>,
  worker: Map<string, Agg & { name: string; departmentName: string | null }>,
): TatLegRow[] => {
  const ids = new Set([...hod.keys(), ...worker.keys()])
  const rows: TatLegRow[] = []
  for (const id of ids) {
    const left = hod.get(id)
    const right = worker.get(id)
    rows.push({
      id,
      name: left?.name ?? right?.name ?? "Unknown",
      departmentName: left?.departmentName ?? right?.departmentName ?? null,
      hod: legOf(left),
      user: legOf(right),
    })
  }
  return rows.sort((a, b) =>
    (b.hod.breaches + b.user.breaches) - (a.hod.breaches + a.user.breaches)
    || (b.hod.measured + b.user.measured) - (a.hod.measured + a.user.measured)
    || a.name.localeCompare(b.name))
}

export const tatLegReport = async (from?: string, to?: string, departmentId?: string, storeId?: string): Promise<TatLegReport> => {
  const range = resolveReportRange("none", from, to)
  const scope: SQL[] = [sql`t.deletedAt IS NULL`]
  if (departmentId) scope.push(sql`t.departmentId = ${departmentId}`)
  if (storeId) scope.push(sql`t.storeId = ${storeId}`)
  const scoped = sql.join(scope, sql` AND `)
  const breachSeconds = HOD_TAT_HOURS * 3600

  const hodWhere = sql`WHERE ${scoped}
    AND t.assignmentApprovedAt IS NOT NULL
    AND t.assignmentApprovedBy IS NOT NULL
    AND t.assignmentApprovedAt >= ${utcSql(range.from)}
    AND t.assignmentApprovedAt <= ${utcSql(range.to)}`
  const userWhere = sql`WHERE ${scoped}
    AND t.claimedAt IS NOT NULL
    AND t.assigneeId IS NOT NULL
    AND COALESCE(t.closedAt, t.submittedAt) IS NOT NULL
    AND COALESCE(t.closedAt, t.submittedAt) >= ${utcSql(range.from)}
    AND COALESCE(t.closedAt, t.submittedAt) <= ${utcSql(range.to)}`

  const hodSpan = sql`TIMESTAMPDIFF(SECOND, t.createdAt, t.assignmentApprovedAt)`
  const userSpan = sql`TIMESTAMPDIFF(SECOND, t.claimedAt, COALESCE(t.closedAt, t.submittedAt))`

  const [hodPeople] = await db.execute(sql`
    SELECT t.assignmentApprovedBy AS id,
      TRIM(CONCAT(u.firstName, ' ', COALESCE(u.lastName, ''))) AS name,
      d.name AS departmentName,
      COUNT(*) AS measured,
      AVG(${hodSpan}) / 3600 AS avgHours,
      COALESCE(SUM(${hodSpan} > ${breachSeconds}), 0) AS breaches
    FROM Ticket t
    JOIN User u ON u.id = t.assignmentApprovedBy
    LEFT JOIN Department d ON d.id = u.departmentId
    ${hodWhere}
    GROUP BY t.assignmentApprovedBy, name, departmentName
  `)

  const [userPeople] = await db.execute(sql`
    SELECT t.assigneeId AS id,
      TRIM(CONCAT(u.firstName, ' ', COALESCE(u.lastName, ''))) AS name,
      d.name AS departmentName,
      COUNT(*) AS measured,
      AVG(${userSpan}) / 3600 AS avgHours,
      COALESCE(SUM(t.tatDueAt IS NOT NULL AND COALESCE(t.closedAt, t.submittedAt) > t.tatDueAt), 0) AS breaches
    FROM Ticket t
    JOIN User u ON u.id = t.assigneeId
    LEFT JOIN Department d ON d.id = u.departmentId
    ${userWhere}
    GROUP BY t.assigneeId, name, departmentName
  `)

  const [hodDepartments] = await db.execute(sql`
    SELECT t.departmentId AS id, d.name AS name, d.name AS departmentName,
      COUNT(*) AS measured,
      AVG(${hodSpan}) / 3600 AS avgHours,
      COALESCE(SUM(${hodSpan} > ${breachSeconds}), 0) AS breaches
    FROM Ticket t
    JOIN Department d ON d.id = t.departmentId
    ${hodWhere}
    GROUP BY t.departmentId, d.name
  `)

  const [userDepartments] = await db.execute(sql`
    SELECT t.departmentId AS id, d.name AS name, d.name AS departmentName,
      COUNT(*) AS measured,
      AVG(${userSpan}) / 3600 AS avgHours,
      COALESCE(SUM(t.tatDueAt IS NOT NULL AND COALESCE(t.closedAt, t.submittedAt) > t.tatDueAt), 0) AS breaches
    FROM Ticket t
    JOIN Department d ON d.id = t.departmentId
    ${userWhere}
    GROUP BY t.departmentId, d.name
  `)

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    hodTargetHours: HOD_TAT_HOURS,
    people: merge(readAgg(hodPeople as unknown as Row[]), readAgg(userPeople as unknown as Row[])),
    departments: merge(readAgg(hodDepartments as unknown as Row[]), readAgg(userDepartments as unknown as Row[])),
  }
}
