import { apiFetch } from './http';
import type { ApiResponse } from './checklistDefinitions';

export type HealthLevel = 'ok' | 'warn' | 'down';
export type HealthJobStatus = 'ok' | 'late' | 'failing' | 'waiting';

export type HealthJob = {
  name: string;
  schedule: string;
  everyMinutes: number;
  status: HealthJobStatus;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  runs: number;
  failures: number;
};

export type SystemHealth = {
  checkedAt: string;
  overall: 'healthy' | 'attention' | 'down';
  attention: string[];
  server: { environment: string; nodeVersion: string; startedAt: string; uptimeSeconds: number; memoryMb: number };
  database: {
    level: HealthLevel;
    latencyMs: number | null;
    version: string | null;
    migrations: number | null;
    totalSizeMb: number;
    tableCount: number;
    biggestTables: { name: string; rows: number; sizeMb: number }[];
    error?: string;
  };
  cache: { level: HealthLevel; status: 'ok' | 'unavailable' };
  jobs: HealthJob[];
  backups: { level: HealthLevel; count: number; latestName: string | null; latestAt: string | null; ageDays: number | null; offsite: boolean };
  alerts: {
    level: HealthLevel;
    configured: boolean;
    activeUsers: number;
    withAlerts: number;
    devices: number;
    withoutAlerts: { id: string; name: string; role: string }[];
    withoutCount: number;
  };
  disk: { level: HealthLevel; known: boolean; totalGb: number; freeGb: number; usedPercent: number; uploads: { measuring: boolean; sizeMb: number; files: number } };
  growth: { known: boolean; days: number; rowsPerDay: number; sizeMbPerDay: number; totalRows: number };
  approvals: { level: HealthLevel; pcCount: number; pcOldestHours: number; headCount: number; headOldestHours: number };
  responses: { level: HealthLevel; known: boolean; requests: number; avgMs: number; maxMs: number; p50Ms: number | null; p95Ms: number | null; slow: number; serverErrors: number };
  errors: { at: string; method: string; path: string; message: string }[];
};

export const systemHealthApi = {
  get: () => apiFetch<ApiResponse<SystemHealth>>('/system-health').then(r => r.data),
};
