import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { connectDB, disconnectDB, db } from '../config/db.js'
import { checklistInstances, checklistDefinitions } from '../db/schema/index.js'
import { loadDefinitionForGeneration, generateInstanceForDefinition } from '../jobs/checklistInstanceGenerator.job.js'
import { refuseInProductionUnlessOverridden } from './_productionGuard.js'

const deleteId = process.argv.find((a) => a.startsWith('--deleteId='))?.split('=')[1]
const confirmed = process.argv.includes('--yes')

const run = async () => {
    refuseInProductionUnlessOverridden('regenerateInstance')
    await connectDB()

    if (!deleteId) {
        const todayStart = new Date()
        todayStart.setUTCHours(0, 0, 0, 0)
        const rows = await db.select({
            id: checklistInstances.id,
            title: checklistInstances.title,
            storeId: checklistInstances.storeId,
            definitionId: checklistInstances.definitionId,
            periodKey: checklistInstances.periodKey,
            generatedAt: checklistInstances.generatedAt,
        }).from(checklistInstances)
        const todays = rows.filter((r) => r.generatedAt >= todayStart)
        console.log(`${todays.length} instance(s) generated today:`)
        for (const r of todays) {
            console.log(`  id=${r.id}  title="${r.title}"  storeId=${r.storeId}  definitionId=${r.definitionId}  periodKey=${r.periodKey}`)
        }
        console.log('\nPass --deleteId=<id> --yes to delete one of these and regenerate it fresh off the current definition.')
        await disconnectDB()
        process.exit(0)
    }

    if (!confirmed) {
        console.error('Refusing to delete: pass --yes to confirm.')
        process.exit(1)
    }

    const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, deleteId))
    if (!instance) {
        console.error(`No instance found with id ${deleteId}.`)
        await disconnectDB()
        process.exit(1)
    }

    const [definition] = await db.select().from(checklistDefinitions).where(eq(checklistDefinitions.id, instance.definitionId))
    if (!definition) {
        console.error(`Instance ${deleteId}'s definition ${instance.definitionId} no longer exists — nothing to regenerate against.`)
        await disconnectDB()
        process.exit(1)
    }

    console.log(`Deleting instance ${deleteId} ("${instance.title}", store ${instance.storeId})...`)
    await db.delete(checklistInstances).where(eq(checklistInstances.id, deleteId))

    const definitionForGeneration = await loadDefinitionForGeneration(definition.id)
    if (!definitionForGeneration) {
        console.error('Could not reload the definition for generation — instance was deleted but not regenerated.')
        await disconnectDB()
        process.exit(1)
    }
    const created = await generateInstanceForDefinition(definitionForGeneration, new Date())
    if (created.length) {
        for (const c of created) console.log(`Regenerated: new instance id=${c.id}`)
    } else {
        console.log('No new instance was created — check the definition is still active and due today.')
    }

    await disconnectDB()
    process.exit(0)
}

run().catch(async (err) => {
    console.error('regenerateInstance failed:', err)
    await disconnectDB()
    process.exit(1)
})
