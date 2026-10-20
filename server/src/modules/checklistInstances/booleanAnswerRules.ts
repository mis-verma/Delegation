type Answer = 'YES' | 'NO'

interface BooleanItemLike {
    booleanAnswer?: Answer | null
    yesActions?: string[] | null
    noActions?: string[] | null
}

interface BooleanValuesLike {
    booleanAnswer?: Answer
    conditionalReasonValue?: string
}

const actionsFor = (item: BooleanItemLike, answer: Answer): string[] =>
    (answer === 'YES' ? item.yesActions : item.noActions) ?? []

export type ConditionalPhotoPurpose = 'CONDITIONAL_YES' | 'CONDITIONAL_NO'

export const conditionalPhotoPurposeFor = (answer: Answer): ConditionalPhotoPurpose =>
    answer === 'YES' ? 'CONDITIONAL_YES' : 'CONDITIONAL_NO'

export const stalePhotoPurposes = (item: BooleanItemLike, values: BooleanValuesLike): ConditionalPhotoPurpose[] => {
    if (values.booleanAnswer === undefined) return []
    const keep = actionsFor(item, values.booleanAnswer).includes('REQUIRE_PHOTO') ? conditionalPhotoPurposeFor(values.booleanAnswer) : null
    return (['CONDITIONAL_YES', 'CONDITIONAL_NO'] as const).filter((p) => p !== keep)
}

export const conditionalReasonPatch = (item: BooleanItemLike, values: BooleanValuesLike): null | undefined => {
    if (values.booleanAnswer === undefined) return undefined
    const asksReason = actionsFor(item, values.booleanAnswer).includes('ASK_REASON')
    if (!asksReason) return null
    const changed = (item.booleanAnswer ?? null) !== values.booleanAnswer
    if (changed && values.conditionalReasonValue === undefined) return null
    return undefined
}
