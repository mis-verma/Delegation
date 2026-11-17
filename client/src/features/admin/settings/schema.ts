import { z } from 'zod';

export const IMAGE_TYPE_OPTIONS = [
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/png', label: 'PNG' },
  { value: 'image/webp', label: 'WEBP' },
];

const retentionDays = z.number().int().min(0, "Can't be negative").max(3650, 'Must be 3650 days (10 years) or less');
const appLink = z.string().trim().max(500).refine((v) => !v || /^https:\/\/\S+$/.test(v), 'Paste a full link starting with https://');

export const settingsSchema = z.object({
  orgName: z.string().trim().min(1, "Organization name can't be empty").max(191, 'Keep it under 191 characters'),
  defaultTatHours: z.number().positive('Must be a positive number'),
  maxUploadSizeMb: z.number().positive('Must be a positive number'),
  maxUploadFiles: z.number().int().positive('Must be a positive whole number'),
  allowedImageTypes: z.array(z.string()).min(1, 'Select at least one file type'),
  maintenanceMode: z.boolean(),
  maintenanceMessage: z.string().max(500, 'Keep it under 500 characters'),
  notifyTaskDeadlineReminders: z.boolean(),
  notifyChecklistOverdueReminders: z.boolean(),
  liveOnlyAttachments: z.boolean(),
  requireAdminLoginCode: z.boolean(),
  loginCodeProof: z.string().optional(),
  accessTokenExpiresMinutes: z.number().int().min(1, 'Must be at least 1 minute').max(1440, 'Must be 1440 minutes (1 day) or less'),
  refreshTokenExpiresDays: z.number().int().min(1, 'Must be at least 1 day').max(365, 'Must be 365 days or less'),
  auditRetentionDays: retentionDays,
  checklistAuditRetentionDays: retentionDays,
  notificationRetentionDays: retentionDays,
  inboundMessageRetentionDays: retentionDays,
  autoCloseDays: z.number().int().min(0, 'Use 0 to turn it off').max(30, 'Must be 30 days or less'),
  androidAppUrl: appLink,
  iosAppUrl: appLink,
});

export type SettingsFields = z.infer<typeof settingsSchema>;

export type SectionKey = 'general' | 'tickets' | 'notifications' | 'security' | 'system';

export const FIELD_SECTION: Record<keyof SettingsFields, SectionKey> = {
  orgName: 'general',
  androidAppUrl: 'general',
  iosAppUrl: 'general',
  defaultTatHours: 'tickets',
  maxUploadSizeMb: 'tickets',
  maxUploadFiles: 'tickets',
  allowedImageTypes: 'tickets',
  autoCloseDays: 'tickets',
  notifyTaskDeadlineReminders: 'notifications',
  notifyChecklistOverdueReminders: 'notifications',
  liveOnlyAttachments: 'notifications',
  accessTokenExpiresMinutes: 'security',
  refreshTokenExpiresDays: 'security',
  requireAdminLoginCode: 'security',
  loginCodeProof: 'security',
  auditRetentionDays: 'system',
  checklistAuditRetentionDays: 'system',
  notificationRetentionDays: 'system',
  inboundMessageRetentionDays: 'system',
  maintenanceMode: 'system',
  maintenanceMessage: 'system',
};
