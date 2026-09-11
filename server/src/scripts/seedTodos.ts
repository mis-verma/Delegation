// One-off command-line script (run like: `npm run seed:todos`) that fills every existing user's
// personal Todo list with a handful of random items. Todos are the one demo category
// `seedDemoData.ts` doesn't cover — they're per-user personal records with no department/store
// scoping to hang seeded data off, so they get their own small script instead.
//
// Safe to run more than once — each run adds another batch per user.
import 'dotenv/config'
import { createId } from '@paralleldrive/cuid2'
import { connectDB, disconnectDB, db } from '../config/db.js'
import { users, todos, TODO_PRIORITIES } from '../db/schema/index.js'
import { refuseInProductionUnlessOverridden } from './_productionGuard.js'

refuseInProductionUnlessOverridden('seedTodos')

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)]
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000)

const TODO_TEXTS = [
  'Follow up on pending vendor email', 'Call back missed customer inquiry', 'Print updated price list',
  'Review yesterday\'s attendance log', 'Draft note for tomorrow\'s handover', 'Check spare stock in back room',
  'Confirm delivery slot with courier', 'Update personal task tracker', 'Send reminder to team about meeting',
  'Clean up desk before shift ends', 'Reply to pending WhatsApp queries', 'Prepare talking points for review',
  'Charge handheld scanner overnight', 'Label new stock arrivals', 'Note down customer feedback from today',
]

const run = async () => {
  await connectDB()

  const userRows = await db.select().from(users)
  if (!userRows.length) {
    console.error('No users in the database — nothing to seed todos against.')
    await disconnectDB()
    process.exit(1)
  }

  let created = 0
  for (const user of userRows) {
    const count = randomInt(3, 8)
    for (let i = 0; i < count; i++) {
      const completed = Math.random() < 0.4
      await db.insert(todos).values({
        id: createId(),
        userId: user.id,
        text: pick(TODO_TEXTS),
        completed,
        // Spread due dates on both sides of "now", same as the demo tasks/tickets script, so
        // overdue and upcoming todos both exist to eyeball.
        dueDate: Math.random() < 0.7 ? (Math.random() < 0.35 ? daysFromNow(-randomInt(1, 7)) : daysFromNow(randomInt(1, 10))) : null,
        priority: pick([...TODO_PRIORITIES]),
      })
      created++
    }
  }

  console.log(`Seeded ${created} todos across ${userRows.length} users.`)

  await disconnectDB()
  process.exit(0)
}

run().catch(async (err) => {
  console.error('Seed failed:', err)
  await disconnectDB()
  process.exit(1)
})
