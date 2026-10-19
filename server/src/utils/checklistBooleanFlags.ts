import { sql } from "drizzle-orm"

export const GATED_BOOLEAN_ITEM_EXPR = sql`(
    cii.itemType IN ('YES_NO', 'PASS_FAIL')
    AND (
        (JSON_LENGTH(cii.noActions) > 0 AND (JSON_LENGTH(cii.yesActions) IS NULL OR JSON_LENGTH(cii.yesActions) = 0))
        OR
        (JSON_LENGTH(cii.yesActions) > 0 AND (JSON_LENGTH(cii.noActions) IS NULL OR JSON_LENGTH(cii.noActions) = 0))
    )
)`

export const FLAGGED_BOOLEAN_ANSWER_EXPR = sql`(
    ${GATED_BOOLEAN_ITEM_EXPR}
    AND (
        (cii.booleanAnswer = 'NO' AND JSON_LENGTH(cii.noActions) > 0)
        OR
        (cii.booleanAnswer = 'YES' AND JSON_LENGTH(cii.yesActions) > 0)
    )
)`
