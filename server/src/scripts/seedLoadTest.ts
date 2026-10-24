import '../config/loadEnv.js'
import { and, eq, like } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { connectDB, disconnectDB, db } from '../config/db.js'
import { env } from '../config/env.js'
import {
  users, stores, departments,
  checklistDefinitions, checklistDefinitionStores,
  checklistInstances, checklistInstanceAssignees, checklistInstanceItems,
} from '../db/schema/index.js'
import { hashPassword } from '../utils/password.js'
import { refuseInProductionUnlessOverridden } from './_productionGuard.js'

refuseInProductionUnlessOverridden('seedLoadTest')

const EMAIL_DOMAIN = 'loadtest.local'
const PASSWORD = 'LoadTest#2026'
const ITEMS_PER_RUN = 8
const BATCH = 200

const databaseName = (() => {
  try { return decodeURIComponent(new URL(env.DATABASE_URL).pathname.replace(/^\//, '')) } catch { return '' }
})()

if (!/loadtest/i.test(databaseName)) {
  console.error(`Refusing to run: database "${databaseName || '(unknown)'}" does not contain "loadtest" in its name.`)
  console.error('Create a throwaway database (e.g. taskmatrix_loadtest), migrate it, and run with DB_NAME=taskmatrix_loadtest.')
  process.exit(1)
}

const userCount = Number(process.argv.find((a) => a.startsWith('--users='))?.split('=')[1] ?? 1000)
if (!Number.isInteger(userCount) || userCount < 1 || userCount > 5000) {
  console.error('--users must be a whole number from 1 to 5000.')
  process.exit(1)
}

const pad = (n: number) => String(n).padStart(4, '0')
const emailFor = (n: number) => `lt-user-${pad(n)}@${EMAIL_DOMAIN}`

const orgToday = (() => {
  const local = new Date(Date.now() + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000)
  const y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate()
  const start = new Date(Date.UTC(y, m, d))
  return {
    periodKey: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    periodStart: start,
    periodEnd: new Date(start.getTime() + 86_400_000 - 1),
  }
})()

const chunks = <T,>(list: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

const run = async () => {
  await connectDB()
  console.log(`Seeding load-test data into database "${databaseName}" (${userCount} users)...`)

  const passwordHash = await hashPassword(PASSWORD)

  let [store] = await db.select().from(stores).where(eq(stores.name, 'LoadTest Store')).limit(1)
  if (!store) {
    const id = createId()
    await db.insert(stores).values({ id, name: 'LoadTest Store', code: 'LT' })
    ;[store] = await db.select().from(stores).where(eq(stores.id, id)).limit(1)
  }
  let [department] = await db.select().from(departments).where(eq(departments.name, 'LoadTest Department')).limit(1)
  if (!department) {
    const id = createId()
    await db.insert(departments).values({ id, name: 'LoadTest Department', storeId: store!.id })
    ;[department] = await db.select().from(departments).where(eq(departments.id, id)).limit(1)
  }

  const adminEmail = `lt-admin@${EMAIL_DOMAIN}`
  let [admin] = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1)
  if (!admin) {
    const id = createId()
    await db.insert(users).values({
      id, email: adminEmail, passwordHash, firstName: 'Load', lastName: 'Admin', role: 'ADMIN',
      storeId: store!.id, departmentId: department!.id,
    })
    ;[admin] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  }

  const existing = await db.select({ id: users.id, email: users.email }).from(users).where(like(users.email, `lt-user-%@${EMAIL_DOMAIN}`))
  const idByEmail = new Map(existing.map((u) => [u.email, u.id]))

  const missing: (typeof users.$inferInsert)[] = []
  for (let n = 1; n <= userCount; n++) {
    const email = emailFor(n)
    if (idByEmail.has(email)) continue
    const id = createId()
    idByEmail.set(email, id)
    missing.push({
      id, email, passwordHash, firstName: 'Load', lastName: `Test ${pad(n)}`, role: 'USER',
      storeId: store!.id, departmentId: department!.id,
    })
  }
  for (const batch of chunks(missing, BATCH)) await db.insert(users).values(batch)
  console.log(`Users: ${missing.length} created, ${userCount - missing.length} already existed.`)

  let [definition] = await db.select().from(checklistDefinitions).where(eq(checklistDefinitions.name, 'LoadTest Daily Check')).limit(1)
  if (!definition) {
    const id = createId()
    await db.insert(checklistDefinitions).values({
      id, name: 'LoadTest Daily Check', description: 'Fake checklist used only by the load test.',
      recurrence: 'DAILY', startDate: new Date(Date.now() - 30 * 86_400_000), createdBy: admin!.id,
    })
    await db.insert(checklistDefinitionStores).values({ definitionId: id, storeId: store!.id })
    ;[definition] = await db.select().from(checklistDefinitions).where(eq(checklistDefinitions.id, id)).limit(1)
  }

  await db.delete(checklistInstances).where(and(eq(checklistInstances.definitionId, definition!.id), eq(checklistInstances.periodKey, orgToday.periodKey)))

  const runs: (typeof checklistInstances.$inferInsert)[] = []
  const assignees: (typeof checklistInstanceAssignees.$inferInsert)[] = []
  const items: (typeof checklistInstanceItems.$inferInsert)[] = []
  for (let n = 1; n <= userCount; n++) {
    const userId = idByEmail.get(emailFor(n))!
    const instanceId = createId()
    runs.push({
      id: instanceId, definitionId: definition!.id, title: definition!.name, recurrence: 'DAILY',
      storeId: store!.id, periodKey: orgToday.periodKey, scopeKey: `user:${userId}`,
      periodStart: orgToday.periodStart, periodEnd: orgToday.periodEnd, generatedAt: new Date(),
    })
    assignees.push({ instanceId, userId })
    for (let i = 0; i < ITEMS_PER_RUN; i++) {
      items.push({ id: createId(), instanceId, label: `Load test question ${i + 1}`, order: i })
    }
  }
  for (const batch of chunks(runs, BATCH)) await db.insert(checklistInstances).values(batch)
  for (const batch of chunks(assignees, BATCH)) await db.insert(checklistInstanceAssignees).values(batch)
  for (const batch of chunks(items, 500)) await db.insert(checklistInstanceItems).values(batch)

  console.log(`Runs: ${runs.length} for ${orgToday.periodKey}, ${ITEMS_PER_RUN} unanswered questions each.`)
  console.log(`Sign in as ${emailFor(1)} ... ${emailFor(userCount)} with password ${PASSWORD}`)
  await disconnectDB()
  process.exit(0)
}

run().catch(async (err) => {
  console.error('seedLoadTest failed:', err)
  await disconnectDB()
  process.exit(1)
})
