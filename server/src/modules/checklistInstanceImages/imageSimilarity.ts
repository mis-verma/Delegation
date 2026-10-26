import { and, asc, gt, isNotNull, ne, sql, type SQL } from "drizzle-orm"
import { db } from "../../config/db.js"
import { checklistInstanceImages } from "../../db/schema/index.js"

export const SIMILAR_MAX_DISTANCE = 4
const WINDOW_DAYS = 90
const DAY_MS = 86_400_000

export const hashDistanceSql = (stored: SQL, hash: string): SQL =>
    sql`(BIT_COUNT(CAST(CONV(LEFT(${stored}, 8), 16, 10) AS UNSIGNED) ^ CAST(CONV(${hash.slice(0, 8)}, 16, 10) AS UNSIGNED)) + BIT_COUNT(CAST(CONV(RIGHT(${stored}, 8), 16, 10) AS UNSIGNED) ^ CAST(CONV(${hash.slice(8)}, 16, 10) AS UNSIGNED)))`

export const findEarlierSimilar = async (hash: string, itemId: string): Promise<string | null> => {
    const since = new Date(Date.now() - WINDOW_DAYS * DAY_MS)
    const [row] = await db
        .select({ id: checklistInstanceImages.id })
        .from(checklistInstanceImages)
        .where(and(
            isNotNull(checklistInstanceImages.contentHash),
            ne(checklistInstanceImages.checklistInstanceItemId, itemId),
            gt(checklistInstanceImages.createdAt, since),
            sql`${hashDistanceSql(sql`${checklistInstanceImages.contentHash}`, hash)} <= ${SIMILAR_MAX_DISTANCE}`,
        ))
        .orderBy(asc(checklistInstanceImages.createdAt))
        .limit(1)
    return row?.id ?? null
}
