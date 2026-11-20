import { sql, type SQL } from "drizzle-orm"
import { checklistInstanceAssignees, checklistInstances, stores, users } from "../../db/schema/index.js"

export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (ch) => `\\${ch}`)

export const instanceSearchCondition = (q: string): SQL => {
    const pattern = `%${escapeLike(q.trim().toLowerCase())}%`
    return sql`(
        LOWER(${checklistInstances.title}) LIKE ${pattern}
        OR EXISTS (SELECT 1 FROM ${stores} s WHERE s.id = ${checklistInstances.storeId} AND LOWER(s.name) LIKE ${pattern})
        OR EXISTS (
            SELECT 1 FROM ${checklistInstanceAssignees} sa
            JOIN ${users} su ON su.id = sa.userId
            WHERE sa.instanceId = ${checklistInstances.id}
              AND (LOWER(su.firstName) LIKE ${pattern} OR LOWER(su.lastName) LIKE ${pattern} OR LOWER(CONCAT(su.firstName, ' ', COALESCE(su.lastName, ''))) LIKE ${pattern})
        )
    )`
}
