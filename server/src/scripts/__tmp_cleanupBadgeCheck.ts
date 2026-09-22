import 'dotenv/config'
import { connectDB, disconnectDB, db } from '../config/db.js'
import { users, refreshTokens } from '../db/schema/core.js'
import { checklistDefinitions } from '../db/schema/checklistDefinition.js'
import { checklistInstances, checklistInstanceAssignees } from '../db/schema/checklistInstance.js'
import { eq } from 'drizzle-orm'

const EMAIL = 'badge-check@taskmatrix.local'

const run = async () => {
  await connectDB()
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL)).limit(1)
  if (!user) {
    console.log('no such user, nothing to clean up')
  } else {
    const [definition] = await db.select({ id: checklistDefinitions.id }).from(checklistDefinitions).where(eq(checklistDefinitions.createdBy, user.id)).limit(1)
    if (definition) {
      const instances = await db.select({ id: checklistInstances.id }).from(checklistInstances).where(eq(checklistInstances.definitionId, definition.id))
      for (const inst of instances) {
        await db.delete(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, inst.id))
      }
      await db.delete(checklistInstances).where(eq(checklistInstances.definitionId, definition.id))
      await db.delete(checklistDefinitions).where(eq(checklistDefinitions.id, definition.id))
      console.log('deleted definition + instances', definition.id)
    }
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id))
    await db.delete(users).where(eq(users.id, user.id))
    console.log('deleted throwaway user:', user.id)
  }
  await disconnectDB()
  process.exit(0)
}

run()
