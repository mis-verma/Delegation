import { describe, expect, it } from 'vitest'
import { effectiveWeekOff, normalizeWeekOff, sameWeekOff } from './orgWeekOff.js'

describe('effectiveWeekOff', () => {
  it('uses the person first, then the store, then the department', () => {
    expect(effectiveWeekOff([0], [1], [2])).toEqual([0])
    expect(effectiveWeekOff([], [1], [2])).toEqual([1])
    expect(effectiveWeekOff(null, null, [2])).toEqual([2])
    expect(effectiveWeekOff(null, [], undefined)).toEqual([])
  })
})

describe('normalizeWeekOff', () => {
  it('turns an empty list into null and sorts and dedupes the rest', () => {
    expect(normalizeWeekOff({ name: 'A', weekOffDays: [] }).weekOffDays).toBeNull()
    expect(normalizeWeekOff({ weekOffDays: [3, 1, 3] }).weekOffDays).toEqual([1, 3])
  })

  it('leaves the input alone when weekOffDays is not sent', () => {
    const input = { name: 'A' }
    expect(normalizeWeekOff(input)).toBe(input)
  })
})

describe('sameWeekOff', () => {
  it('treats null, undefined and empty as the same', () => {
    expect(sameWeekOff(null, [])).toBe(true)
    expect(sameWeekOff([2, 1], [1, 2])).toBe(true)
    expect(sameWeekOff([1], [2])).toBe(false)
  })
})
