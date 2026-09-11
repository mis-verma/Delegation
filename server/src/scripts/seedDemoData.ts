// One-off command-line script (run like: `npm run seed:demo`) that fills the app with random
// but realistic Delegations, Issues, Tickets, and Checklist runs against your EXISTING users,
// departments, stores, and categories — so the dashboard, task lists, ticket lists, and the
// Today's Runs checklist page all have something to show while testing.
//
// It never touches real accounts/org structure — it only reads them to attach realistic
// relations, then creates new Task/Ticket/ChecklistDefinition/ChecklistInstance rows.
// Safe to run more than once (each run just adds another batch).
import 'dotenv/config'
import { eq, and } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { connectDB, disconnectDB, db } from '../config/db.js'
import {
  users, departments, stores, categories,
  tasks, TASK_STATUSES, TASK_PRIORITIES, taskChecklists, taskChecklistItems,
  tickets, TICKET_STATUSES, TICKET_PRIORITIES,
  checklistDefinitions, checklistDefinitionStores,
  checklistInstances, checklistInstanceAssignees, checklistInstanceItems,
} from '../db/schema/index.js'
import { refuseInProductionUnlessOverridden } from './_productionGuard.js'

refuseInProductionUnlessOverridden('seedDemoData')

type TaskStatus = (typeof TASK_STATUSES)[number]

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)]
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000)

const DELEGATION_TITLES = [
  'Follow up with vendor on delayed shipment', 'Prepare monthly stock reconciliation',
  'Update store signage for the new promotion', 'Coordinate staff schedule for the weekend',
  'Review CCTV footage for the storage area', 'Submit expense report for last month',
  'Onboard new hire on POS system', 'Restock display counters before opening',
  'Call back customer about warranty claim', 'Audit petty cash drawer',
  'Prepare quarterly sales presentation', 'Schedule AC maintenance for the showroom',
  'Verify insurance documents for new inventory', 'Coordinate with logistics on delivery route',
  'Finalize vendor contract renewal', 'Train staff on new checklist app',
  'Reconcile discrepancy in billing software', 'Plan festive season inventory',
  'Update employee handbook section 4', 'Inspect fire safety equipment',
]

const ISSUE_TITLES = [
  'POS terminal freezing intermittently', 'AC not cooling in the east wing',
  'Broken glass display case in showroom 2', 'Wi-Fi router needs replacement',
  'Water leakage near the storeroom', 'Security camera offline since morning',
  'Billing software throwing checkout errors', 'Backup generator failed test run',
  'Flickering lights in the main hall', 'Damaged flooring near the entrance',
]

const CHECKLIST_ITEM_LABELS = [
  'Check entrance cleanliness', 'Verify cash drawer count', 'Inspect fire extinguisher',
  'Confirm display lighting is on', 'Check AC temperature setting', 'Verify CCTV is recording',
  'Inspect staff uniform compliance', 'Confirm inventory count matches system',
  'Check restroom cleanliness', 'Verify signage is up to date',
]

// Item sets for department-flavored daily checklists — keyed by department name (uppercased) so
// real departments like "IT"/"MDO" get on-topic items instead of generic store-ops language;
// anything else falls back to GENERIC_DEPT_ITEMS below.
const DEPARTMENT_CHECKLIST_ITEMS: Record<string, string[]> = {
  IT: [
    'Check server room temperature', 'Verify overnight backup completed', 'Test POS network connectivity',
    'Inspect CCTV recording status', 'Confirm Wi-Fi router uptime', 'Check UPS battery health',
  ],
  MDO: [
    'Verify daily sales report generated', 'Reconcile petty cash drawer', 'Check staff attendance log',
    'Confirm vendor deliveries logged', 'Review pending customer complaints', 'Update inventory variance sheet',
  ],
}
const GENERIC_DEPT_ITEMS = [
  'Review pending tasks for the day', 'Check team attendance', 'Verify daily target tracking sheet',
  'Inspect work area cleanliness', 'Confirm equipment is functioning', 'Log any incidents from the shift',
]

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

const run = async () => {
  await connectDB()

  // Not filtered by isActive — this dev database's real Department/Store/Category rows are
  // sometimes toggled inactive while testing other features, but they're still perfectly fine to
  // attach demo Tasks/Tickets/Checklists to for a manual smoke test.
  const [userRows, departmentRows, storeRows, categoryRows] = await Promise.all([
    db.select().from(users),
    db.select().from(departments),
    db.select().from(stores),
    db.select().from(categories),
  ])

  if (!userRows.length || !departmentRows.length || !storeRows.length) {
    console.error('Need at least one active user, department, and store already in the database before seeding demo data.')
    await disconnectDB()
    process.exit(1)
  }

  const admin = userRows.find((u) => u.role === 'ADMIN') ?? userRows[0]!

  // ── Delegations + Issues (Task table — "issue"/"delegation" are its two categories) ─────────
  const taskCount = randomInt(10, 20)
  const createdTasks: string[] = []

  for (let i = 0; i < taskCount; i++) {
    const isIssue = Math.random() < 0.3
    const status: TaskStatus = pick([...TASK_STATUSES])
    const raiser = pick(userRows)
    const assignee = pick(userRows)
    const department = pick(departmentRows)
    // Spread due dates on both sides of "now" so overdue (past, not done) and upcoming tasks both
    // exist — useful for eyeballing the Mark badge/Target gauge and the overdue counts.
    const dueDate = Math.random() < 0.4 ? daysFromNow(-randomInt(1, 10)) : daysFromNow(randomInt(1, 14))

    const taskId = createId()
    await db.insert(tasks).values({
      id: taskId,
      title: isIssue ? pick(ISSUE_TITLES) : pick(DELEGATION_TITLES),
      description: 'Seeded demo record for testing.',
      category: isIssue ? 'issue' : 'delegation',
      status,
      priority: pick([...TASK_PRIORITIES]),
      dueDate,
      userId: raiser.id,
      assigneeId: assignee.id,
      departmentId: department.id,
      ...(status === 'done' ? { verifiedBy: admin.id, verifiedAt: new Date() } : {}),
    })
    createdTasks.push(taskId)

    // Give ~60% of tasks a small checklist so completion/photo-compliance reporting has real data.
    if (Math.random() < 0.6) {
      const checklistId = createId()
      await db.insert(taskChecklists).values({ id: checklistId, title: 'Sub-tasks', taskId })
      const itemCount = randomInt(3, 5)
      // Tasks further along their status get a higher chance of each sub-item being checked off.
      const doneChance = status === 'done' ? 1 : status === 'pending_verification' ? 0.9 : status === 'in_progress' ? 0.5 : 0.1
      for (let j = 0; j < itemCount; j++) {
        const isDone = Math.random() < doneChance
        await db.insert(taskChecklistItems).values({
          id: createId(),
          label: pick(CHECKLIST_ITEM_LABELS),
          isDone,
          completedAt: isDone ? new Date() : null,
          taskChecklistId: checklistId,
        })
      }
    }
  }

  // ── Tickets ("Issue tickets") ─────────────────────────────────────────────────────────────
  const ticketCount = randomInt(10, 20)
  const createdTickets: string[] = []

  for (let i = 0; i < ticketCount; i++) {
    const status = pick([...TICKET_STATUSES])
    const category = categoryRows.length ? pick(categoryRows) : null
    const raiser = pick(userRows)
    const assignee = pick(userRows)
    const store = pick(storeRows)
    const department = category ? category.departmentId : pick(departmentRows).id
    const tatHours = pick([12, 24, 48, 72])
    const overdue = status !== 'CLOSED' && Math.random() < 0.35
    const createdAt = new Date()
    // Ticket's tatDueAt is normally recomputed by a service-layer helper on create (was a
    // Mongoose pre('save') hook) — this raw seed script bypasses the service layer entirely, so
    // it has to derive tatDueAt itself the same way (now + tatHours).
    const tatDueAt = new Date(createdAt.getTime() + tatHours * 60 * 60 * 1000)

    const ticketId = createId()
    await db.insert(tickets).values({
      id: ticketId,
      title: pick(ISSUE_TITLES),
      description: 'Seeded demo record for testing.',
      status,
      priority: pick([...TICKET_PRIORITIES]),
      tatHours,
      tatDueAt,
      userId: raiser.id,
      assigneeId: assignee.id,
      storeId: store.id,
      categoryId: category?.id ?? null,
      departmentId: department,
      ...(status === 'CLOSED' ? { closedAt: new Date(), verifiedBy: admin.id, verifiedAt: new Date() } : {}),
    })

    // Backdate tatDueAt (and flag isOverdue) to simulate an overdue ticket, same as the original
    // script's raw updateOne that bypassed the tatDueAt-recompute hook.
    if (overdue) {
      await db.update(tickets).set({ tatDueAt: daysFromNow(-randomInt(1, 5)), isOverdue: true, updatedAt: new Date() }).where(eq(tickets.id, ticketId))
    }
    createdTickets.push(ticketId)
  }

  // ── Checklist templates + runs (ChecklistDefinition/ChecklistInstance — powers "Today's Runs",
  // the Checklist Templates grid, and each template's completion/compliance rate) ──────────────
  // One store-wide opening checklist, plus one department-flavored operations checklist per real
  // department in the DB — so "store wise" and "department wise" checklists actually exist as
  // distinct templates, each with their own item set and its own completion/compliance track
  // record (doneBias varies per checklist so the rates on the grid actually differ from each other).
  const pad2 = (n: number) => String(n).padStart(2, '0')

  type ChecklistSpec = { name: string; description: string; assigneeRoles: string[]; items: string[]; doneBias: number; storeIds: string[] }

  const checklistSpecs: ChecklistSpec[] = [
    {
      name: 'Store Opening Walkthrough',
      description: 'Daily opening procedure before the store opens to customers.',
      assigneeRoles: ['STORE_MANAGER'],
      items: [
        'Unlock front entrance and disable alarm', 'Turn on all display lighting',
        'Verify cash drawer opening float', 'Check AC/HVAC is running',
        'Inspect entrance for cleanliness', 'Confirm POS terminals are online',
      ],
      doneBias: 0.85,
      storeIds: storeRows.map((s) => s.id), // genuinely store-wide — live in every store
    },
    ...departmentRows.slice(0, 4).map((dept, i): ChecklistSpec => ({
      name: `${dept.name} Daily Operations Check`,
      description: `Daily operational checklist for the ${dept.name} department.`,
      assigneeRoles: ['OPERATIONS'],
      items: DEPARTMENT_CHECKLIST_ITEMS[dept.name.toUpperCase()] ?? GENERIC_DEPT_ITEMS,
      doneBias: randomInt(35, 90) / 100, // spread completion health across checklists on purpose
      storeIds: [storeRows[i % storeRows.length]!.id], // store-wise: pinned to one store, rotated round-robin
    })),
  ]

  const createdInstances: string[] = []

  for (const spec of checklistSpecs) {
    let [definition] = await db.select().from(checklistDefinitions).where(eq(checklistDefinitions.name, spec.name)).limit(1)
    if (!definition) {
      const definitionId = createId()
      await db.insert(checklistDefinitions).values({
        id: definitionId,
        name: spec.name,
        description: spec.description,
        recurrence: 'DAILY',
        startDate: daysFromNow(-30),
        assigneeRoles: spec.assigneeRoles as any,
        createdBy: admin.id,
      })
      await db.insert(checklistDefinitionStores).values(
        spec.storeIds.map((storeId) => ({ definitionId, storeId })),
      )
      ;[definition] = await db.select().from(checklistDefinitions).where(eq(checklistDefinitions.id, definitionId)).limit(1)
    }

    const runCount = randomInt(10, 20)
    for (let i = 0; i < runCount; i++) {
      const store = pick(spec.storeIds)
      const dayOffset = -i // one run per day going backward, so this reads as a real run history
      const periodStart = daysFromNow(dayOffset)
      periodStart.setHours(0, 0, 0, 0)
      const periodEnd = new Date(periodStart.getTime() + 86_400_000 - 1)
      const periodKey = `${periodStart.getFullYear()}-${pad2(periodStart.getMonth() + 1)}-${pad2(periodStart.getDate())}`

      // Older runs lean further toward this checklist's baseline "health"; today's/yesterday's
      // run is more likely still mid-flight, regardless of how healthy the checklist normally is.
      const doneChance = clamp01(dayOffset <= -3 ? spec.doneBias + 0.1 : dayOffset === 0 ? spec.doneBias - 0.3 : spec.doneBias)

      const instanceId = createId()
      try {
        await db.insert(checklistInstances).values({
          id: instanceId,
          definitionId: definition!.id,
          title: definition!.name,
          recurrence: 'DAILY',
          storeId: store,
          periodKey,
          periodStart,
          periodEnd,
          generatedAt: periodStart,
        })
      } catch (err: any) {
        // (definitionId, storeId, periodKey) already exists from a previous run of this script —
        // skip rather than crash the whole batch. Drizzle wraps the real mysql2 driver error
        // inside `err.cause` (a DrizzleQueryError), so `err.code` itself is always undefined here
        // — this never actually caught anything until checking `err.cause?.code` too.
        if (err?.code === 'ER_DUP_ENTRY' || err?.cause?.code === 'ER_DUP_ENTRY') continue
        throw err
      }
      await db.insert(checklistInstanceAssignees).values({ instanceId, userId: pick(userRows).id })
      createdInstances.push(instanceId)

      const itemCount = randomInt(4, spec.items.length)
      const itemDones: boolean[] = []
      for (let j = 0; j < itemCount; j++) {
        const isDone = Math.random() < doneChance
        itemDones.push(isDone)
        await db.insert(checklistInstanceItems).values({
          id: createId(),
          label: spec.items[j] ?? pick(CHECKLIST_ITEM_LABELS),
          order: j,
          isDone,
          completedAt: isDone ? new Date() : null,
          instanceId,
        })
      }

      const allDone = itemDones.length > 0 && itemDones.every(Boolean)
      if (allDone) {
        const verificationStatus = pick(['PENDING', 'PENDING', 'APPROVED', 'REJECTED'] as const)
        await db.update(checklistInstances).set({
          verificationStatus,
          ...(verificationStatus === 'APPROVED' || verificationStatus === 'REJECTED'
            ? { verifiedBy: admin.id, verifiedAt: new Date() }
            : {}),
          updatedAt: new Date(),
        }).where(eq(checklistInstances.id, instanceId))
      }
    }
  }

  console.log(`Seeded ${createdTasks.length} delegations/issues, ${createdTickets.length} tickets, ${checklistSpecs.length} checklist templates with ${createdInstances.length} total runs.`)

  await disconnectDB()
  process.exit(0)
}

run().catch(async (err) => {
  console.error('Seed failed:', err)
  await disconnectDB()
  process.exit(1)
})
