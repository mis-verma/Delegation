import { describe, expect, it } from 'vitest'
import { conditionalPhotoPurposeFor, conditionalReasonPatch, stalePhotoPurposes } from './booleanAnswerRules.js'

const item = { booleanAnswer: 'NO' as const, yesActions: [] as string[], noActions: ['ASK_REASON', 'REQUIRE_PHOTO'] }

describe('conditionalReasonPatch', () => {
    it('leaves the reason alone when no boolean answer is sent', () => {
        expect(conditionalReasonPatch(item, {})).toBeUndefined()
    })

    it('clears a stale reason when the answer flips to one that asks for none', () => {
        expect(conditionalReasonPatch(item, { booleanAnswer: 'YES' })).toBeNull()
        expect(conditionalReasonPatch(item, { booleanAnswer: 'YES', conditionalReasonValue: 'old text' })).toBeNull()
    })

    it('keeps the reason when the same triggering answer is saved again', () => {
        expect(conditionalReasonPatch(item, { booleanAnswer: 'NO', conditionalReasonValue: 'Broken lock' })).toBeUndefined()
        expect(conditionalReasonPatch(item, { booleanAnswer: 'NO' })).toBeUndefined()
    })

    it('clears the old reason when a new triggering answer arrives without its own', () => {
        const both = { booleanAnswer: 'NO' as const, yesActions: ['ASK_REASON'], noActions: ['ASK_REASON'] }
        expect(conditionalReasonPatch(both, { booleanAnswer: 'YES' })).toBeNull()
        expect(conditionalReasonPatch(both, { booleanAnswer: 'YES', conditionalReasonValue: 'Because' })).toBeUndefined()
    })

    it('handles a first answer on an item with no stored answer', () => {
        const fresh = { booleanAnswer: null, yesActions: [] as string[], noActions: ['ASK_REASON'] }
        expect(conditionalReasonPatch(fresh, { booleanAnswer: 'NO', conditionalReasonValue: 'Reason' })).toBeUndefined()
        expect(conditionalReasonPatch(fresh, { booleanAnswer: 'YES' })).toBeNull()
    })
})

describe('stalePhotoPurposes', () => {
    const photoRules = { booleanAnswer: null, yesActions: [] as string[], noActions: ['REQUIRE_PHOTO'] }

    it('keeps photos taken for the answer that needs them', () => {
        expect(stalePhotoPurposes(photoRules, { booleanAnswer: 'NO' })).toEqual(['CONDITIONAL_YES'])
    })

    it('drops photos taken for a different answer', () => {
        const both = { booleanAnswer: null, yesActions: ['REQUIRE_PHOTO'], noActions: ['REQUIRE_PHOTO'] }
        expect(stalePhotoPurposes(both, { booleanAnswer: 'YES' })).toEqual(['CONDITIONAL_NO'])
    })

    it('drops every conditional photo when the new answer asks for none', () => {
        expect(stalePhotoPurposes(photoRules, { booleanAnswer: 'YES' })).toEqual(['CONDITIONAL_YES', 'CONDITIONAL_NO'])
    })

    it('does nothing when no boolean answer is sent', () => {
        expect(stalePhotoPurposes(photoRules, {})).toEqual([])
    })

    it('maps an answer to its photo purpose', () => {
        expect(conditionalPhotoPurposeFor('YES')).toBe('CONDITIONAL_YES')
        expect(conditionalPhotoPurposeFor('NO')).toBe('CONDITIONAL_NO')
    })
})
