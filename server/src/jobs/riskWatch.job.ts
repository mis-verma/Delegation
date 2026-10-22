import { scheduleJob } from '../utils/jobTracker.js'
import { approvalsSection, diskSection, QUEUE_DOWN_HOURS } from '../modules/health/risk.service.js'
import { notificationService } from '../modules/notifications/notification.service.js'

const DISK_ALERT_PERCENT = 85
const REPEAT_MS = 24 * 60 * 60_000
const lastSent = new Map<string, number>()

const due = (key: string, now: number) => now - (lastSent.get(key) ?? 0) >= REPEAT_MS

export const startRiskWatch = () => {
  scheduleJob('risk-watch', '17 * * * *', 60, async () => {
    const now = Date.now()

    const disk = await diskSection()
    if (disk.known && disk.usedPercent >= DISK_ALERT_PERCENT && due('disk', now)) {
      lastSent.set('disk', now)
      await notificationService.notifyAdminsOfRisk('DISK', 'Server disk is almost full', `The disk is ${disk.usedPercent}% full with ${disk.freeGb} GB left. Free space or move photos to S3 before uploads stop working.`)
    }

    const approvals = await approvalsSection()
    const longestWait = Math.max(approvals.pcCount ? approvals.pcOldestHours : 0, approvals.headCount ? approvals.headOldestHours : 0)
    if (longestWait >= QUEUE_DOWN_HOURS && due('approvals', now)) {
      lastSent.set('approvals', now)
      await notificationService.notifyAdminsOfRisk('APPROVALS', 'Approvals are stuck', `${approvals.pcCount} waiting for PC and ${approvals.headCount} waiting for a department head. The oldest has waited ${longestWait} hours.`)
    }
  })
}
