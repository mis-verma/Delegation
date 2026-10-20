import { describe, expect, it } from 'vitest'
import { formatClock, lateWindowProblem } from './lateWindow.js'

describe('lateWindowProblem', () => {
    const daily = { recurrence: 'DAILY', opensTime: '09:30', cutoffTime: '18:30' }

    it('allows no late window', () => {
        expect(lateWindowProblem(daily)).toBeNull()
    })

    it('allows a late window after the closing time', () => {
        expect(lateWindowProblem({ ...daily, lateUntilTime: '21:00' })).toBeNull()
    })

    it('rejects a late window that ends at or before closing', () => {
        expect(lateWindowProblem({ ...daily, lateUntilTime: '18:30' })).toMatch(/after the closing time/)
        expect(lateWindowProblem({ ...daily, lateUntilTime: '17:00' })).toMatch(/after the closing time/)
    })

    it('needs a closing time', () => {
        expect(lateWindowProblem({ recurrence: 'DAILY', lateUntilTime: '21:00' })).toMatch(/closing time/)
    })

    it('rejects an overnight checklist', () => {
        expect(lateWindowProblem({ recurrence: 'DAILY', opensTime: '22:00', cutoffTime: '06:00', lateUntilTime: '08:00' })).toMatch(/midnight/)
    })

    it('rejects weekly and longer checklists', () => {
        expect(lateWindowProblem({ recurrence: 'WEEKLY', cutoffTime: '18:00', lateUntilTime: '21:00' })).toMatch(/daily or one-time/)
    })
})

describe('formatClock', () => {
    it('formats 12-hour times', () => {
        expect(formatClock('21:00')).toBe('9:00 PM')
        expect(formatClock('00:05')).toBe('12:05 AM')
        expect(formatClock('12:30')).toBe('12:30 PM')
    })
})
