import { sql } from "drizzle-orm"

// Shared by checklistDefinition.service.ts's statsByDefinition and checklistInstance.service.ts's
// complianceReport — both raw-SQL aggregates over `ChecklistInstanceItem cii` (aliased exactly
// that way in both places), so these fragments assume that alias is in scope.
//
// A YES_NO/PASS_FAIL item is "gated" when exactly one branch (Yes or No) has at least one
// conditional action configured (REQUIRE_PHOTO/ASK_REASON/CREATE_ISSUE/NOTIFY_AREA_MANAGER) — an
// author only wires those up on the answer that needs scrutiny, so that's the branch this treats
// as "the bad one." An item with actions on both branches, or neither, gives no signal about
// which answer is bad, so it's excluded from the metric entirely rather than guessed at.
export const GATED_BOOLEAN_ITEM_EXPR = sql`(
    cii.itemType IN ('YES_NO', 'PASS_FAIL')
    AND (
        (JSON_LENGTH(cii.noActions) > 0 AND (JSON_LENGTH(cii.yesActions) IS NULL OR JSON_LENGTH(cii.yesActions) = 0))
        OR
        (JSON_LENGTH(cii.yesActions) > 0 AND (JSON_LENGTH(cii.noActions) IS NULL OR JSON_LENGTH(cii.noActions) = 0))
    )
)`

// True when a gated item's actual answer landed on its flagged branch. Stays true regardless of
// whether a required photo/reason was supplied to get past it — satisfying REQUIRE_PHOTO/ASK_REASON
// only unblocks completion, it never turns a flagged answer back into a clean one.
export const FLAGGED_BOOLEAN_ANSWER_EXPR = sql`(
    ${GATED_BOOLEAN_ITEM_EXPR}
    AND (
        (cii.booleanAnswer = 'NO' AND JSON_LENGTH(cii.noActions) > 0)
        OR
        (cii.booleanAnswer = 'YES' AND JSON_LENGTH(cii.yesActions) > 0)
    )
)`
