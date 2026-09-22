import 'dotenv/config'
import { connectDB, disconnectDB, db } from '../config/db.js'
import { users, stores } from '../db/schema/core.js'
import { checklistDefinitions } from '../db/schema/checklistDefinition.js'
import { checklistInstances, checklistInstanceAssignees } from '../db/schema/checklistInstance.js'
import { eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'

const EMAIL = 'badge-check@taskmatrix.local'

const run = async () => {
  await connectDB()
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL)).limit(1)
  if (!user) throw new Error('register first')
  const [store] = await db.select({ id: stores.id }).from(stores).limit(1)
  if (!store) throw new Error('no store')

  const definitionId = createId()
  const now = new Date()
  await db.insert(checklistDefinitions).values({
    id: definitionId,
    name: 'Overdue badge check — closing checklist',
    recurrence: 'DAILY',
    startDate: now,
    createdBy: user.id,
  })

  const dayMs = 86_400_000
  for (let daysAgo = 2; daysAgo >= 1; daysAgo--) {
    const periodStart = new Date(now.getTime() - daysAgo * dayMs)
    const periodEnd = new Date(periodStart.getTime() + dayMs)
    const instanceId = createId()
    await db.insert(checklistInstances).values({
      id: instanceId,
      definitionId,
      title: `Overdue badge check (${periodStart.toISOString().slice(0, 10)})`,
      storeId: store.id,
      recurrence: 'DAILY',
      periodKey: periodStart.toISOString().slice(0, 10),
      periodStart,
      periodEnd,
      verificationStatus: 'NOT_SUBMITTED',
    })
    await db.insert(checklistInstanceAssignees).values({ id: createId(), instanceId, userId: user.id })
    console.log('created overdue instance for', periodStart.toISOString().slice(0, 10))
  }

  await disconnectDB()
  process.exit(0)
}

run().catch((e) => { console.error(e); process.exit(1) })
