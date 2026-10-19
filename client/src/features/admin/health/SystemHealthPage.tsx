import { memo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, CircleDashed, Database, HardDrive, HeartPulse, Layers, RefreshCw, Server, TriangleAlert, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, IconChip, InlineError, NoticeBanner, PageHeader, PANEL_CLASS, Skeleton } from '../../../components';
import { useSystemHealthQuery } from './hook';
import type { HealthJob, HealthJobStatus, HealthLevel, SystemHealth } from '../../../api/systemHealth';

const timeAgo = (iso: string | null) => {
  if (!iso) return 'Never';
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86_400)} d ago`;
};

const uptime = (seconds: number) => {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
};

const duration = (ms: number | null) => (ms == null ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

const LEVEL_TONE: Record<HealthLevel, { tone: string; icon: LucideIcon; label: string }> = {
  ok: { tone: 'bg-success', icon: CheckCircle2, label: 'Healthy' },
  warn: { tone: 'bg-warning', icon: TriangleAlert, label: 'Needs a look' },
  down: { tone: 'bg-danger', icon: XCircle, label: 'Down' },
};

const JOB_TONE: Record<HealthJobStatus, { level: HealthLevel | 'idle'; label: string }> = {
  ok: { level: 'ok', label: 'Running' },
  late: { level: 'warn', label: 'Late' },
  failing: { level: 'down', label: 'Failing' },
  waiting: { level: 'idle', label: 'Not run yet' },
};

const LevelChip = ({ level, label }: { level: HealthLevel | 'idle'; label?: string }) =>
  level === 'idle'
    ? <IconChip icon={CircleDashed} tone="bg-text-muted" label={label ?? 'Waiting'} className="shrink-0" />
    : <IconChip icon={LEVEL_TONE[level].icon} tone={LEVEL_TONE[level].tone} label={label ?? LEVEL_TONE[level].label} className="shrink-0" />;

const LEVEL_TILE: Record<HealthLevel, string> = { ok: 'from-success to-success-strong', warn: 'from-warning to-warning/70', down: 'from-danger to-danger/70' };

const Tile = ({ icon, title, level, children }: { icon: ReactNode; title: string; level: HealthLevel; children: ReactNode }) => (
  <section className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-4')}>
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2.5 t-card font-display font-bold text-text">
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br text-white', LEVEL_TILE[level])} aria-hidden="true">{icon}</span>
        {title}
      </h2>
      <LevelChip level={level} />
    </div>
    <div className="flex flex-col gap-1 text-xs font-display text-text-muted">{children}</div>
  </section>
);

const Stat = ({ value, label }: { value: string; label: string }) => (
  <p className="flex items-baseline gap-1.5">
    <span className="t-section font-display font-extrabold text-text tabular-nums">{value}</span>
    <span>{label}</span>
  </p>
);

const JobRow = memo(({ job }: { job: HealthJob }) => {
  const tone = JOB_TONE[job.status];
  return (
    <li className="flex flex-col gap-1.5 p-3.5 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <p className="text-sm font-display font-semibold text-text leading-snug">{job.name.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase())}</p>
        <p className="text-xs font-display text-text-muted">
          {job.status === 'waiting' ? 'Has not run since the server started' : `Last run ${timeAgo(job.lastRunAt)}${job.lastDurationMs != null ? `, took ${duration(job.lastDurationMs)}` : ''}`}
          {job.failures > 0 && ` · ${job.failures} failed of ${job.runs}`}
        </p>
        {job.lastError && <p className="text-xs font-display text-danger break-words">{job.lastError}</p>}
      </div>
      <LevelChip level={tone.level} label={tone.label} />
    </li>
  );
});
JobRow.displayName = 'JobRow';

const OverallBanner = ({ health }: { health: SystemHealth }) => {
  const down = health.overall === 'down';
  const ok = health.overall === 'healthy';
  return (
    <NoticeBanner tone={ok ? 'success' : down ? 'danger' : 'warning'} icon={ok ? CheckCircle2 : TriangleAlert} className="p-4 rounded-2xl">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-display font-semibold">
          {ok ? 'Everything is running fine' : down ? 'The system is down' : `${health.attention.length} ${health.attention.length === 1 ? 'thing needs' : 'things need'} a look`}
        </p>
        {health.attention.map(item => (
          <p key={item} className="text-xs font-display leading-relaxed">{item}</p>
        ))}
      </div>
    </NoticeBanner>
  );
};

const HealthSkeleton = () => (
  <div className="flex flex-col gap-4">
    <Skeleton className="min-h-16 w-full rounded-lg" />
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="min-h-28 rounded-2xl" />)}
    </div>
    <Skeleton className="min-h-40 w-full rounded-2xl" />
  </div>
);

export const SystemHealthPage = () => {
  const { data: health, isPending, isError, isFetching, refetch, dataUpdatedAt } = useSystemHealthQuery();
  const biggestTableMb = health?.database.biggestTables[0]?.sizeMb || 1;

  return (
    <div className="flex flex-col gap-6 w-full">
      <PageHeader
        icon={HeartPulse}
        title="System Health"
        subtitle={dataUpdatedAt ? `Checked ${timeAgo(new Date(dataUpdatedAt).toISOString())}. Refreshes every 30 seconds.` : 'Checking now.'}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} aria-hidden />
            Check now
          </Button>
        }
      />

      {isError && (
        <InlineError
          message="We couldn't reach the server to check. If this page won't load, the server itself may be down."
          onRetry={() => refetch()}
        />
      )}

      {isPending && <HealthSkeleton />}

      {health && (
        <>
          <OverallBanner health={health} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Tile icon={<Server size={15} />} title="Server" level="ok">
              <Stat value={uptime(health.server.uptimeSeconds)} label="since last restart" />
              <p>{health.server.memoryMb} MB memory · Node {health.server.nodeVersion.replace('v', '')} · {health.server.environment}</p>
            </Tile>
            <Tile icon={<Database size={15} />} title="Database" level={health.database.level}>
              {health.database.level === 'down' ? (
                <p className="text-danger">{health.database.error ?? 'Not responding.'}</p>
              ) : (
                <>
                  <Stat value={`${health.database.latencyMs} ms`} label="to answer" />
                  <p>MySQL {health.database.version} · {health.database.totalSizeMb} MB · {health.database.migrations ?? '?'} updates applied</p>
                </>
              )}
            </Tile>
            <Tile icon={<Layers size={15} />} title="Cache" level={health.cache.level}>
              <p>{health.cache.status === 'ok' ? 'Redis is connected. Repeated lookups are served from memory.' : 'Redis is not connected. Everything still works, but lookups hit the database each time.'}</p>
            </Tile>
            <Tile icon={<HardDrive size={15} />} title="Data backups" level={health.backups.level}>
              {health.backups.latestAt ? (
                <>
                  <Stat value={timeAgo(health.backups.latestAt)} label="newest backup" />
                  <p>{health.backups.count} saved on the server. Backups taken by your hosting provider are not visible here.</p>
                </>
              ) : (
                <p>No backup found on the server. Run a backup before any large clean-up, and keep one with your hosting provider as well.</p>
              )}
            </Tile>
          </div>

          <section className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <h2 className="t-section font-display font-bold text-text">Background jobs</h2>
              <IconChip icon={CheckCircle2} tone={health.jobs.some((j) => j.status === 'failing') ? 'bg-danger' : health.jobs.some((j) => j.status === 'late') ? 'bg-warning' : 'bg-success'} label={`${health.jobs.length} ${health.jobs.length === 1 ? 'job' : 'jobs'}`} />
            </div>
            {health.jobs.length === 0 ? (
              <p className="text-xs font-display text-text-muted">No background jobs are registered on this server.</p>
            ) : (
              <ul className={cn(PANEL_CLASS, 'flex flex-col divide-y divide-border/60 overflow-hidden')}>
                {health.jobs.map(job => <JobRow key={job.name} job={job} />)}
              </ul>
            )}
          </section>

          {health.database.biggestTables.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <h2 className="t-section font-display font-bold text-text">Where the data lives</h2>
              <ul className={cn(PANEL_CLASS, 'flex flex-col gap-2 p-4')}>
                {health.database.biggestTables.map(t => (
                  <li key={t.name} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-xs font-display">
                    <span className="truncate text-text-secondary" title={t.name}>{t.name}</span>
                    <span className="h-2 rounded-full bg-surface-hover overflow-hidden">
                      <span className="block h-full rounded-full bg-primary-500" style={{ width: `${Math.max(3, (t.sizeMb / biggestTableMb) * 100)}%` }} />
                    </span>
                    <span className="text-text-muted tabular-nums">{t.sizeMb} MB · {t.rows.toLocaleString()} rows</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <h2 className="t-section font-display font-bold text-text">Recent server errors</h2>
              <IconChip icon={health.errors.length ? TriangleAlert : CheckCircle2} tone={health.errors.length ? 'bg-danger' : 'bg-success'} label={health.errors.length ? `${health.errors.length} since restart` : 'None'} />
            </div>
            {health.errors.length === 0 ? (
              <p className="text-xs font-display text-text-muted">No unexpected errors since the server last restarted.</p>
            ) : (
              <ul className={cn(PANEL_CLASS, 'flex flex-col divide-y divide-border/60 overflow-hidden')}>
                {health.errors.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="flex flex-col gap-0.5 p-3.5">
                    <p className="flex items-center gap-2 text-xs font-display font-semibold text-text break-all"><IconChip icon={false} label={e.method} className="pl-2.5 shrink-0" />{e.path}</p>
                    <p className="text-xs font-display text-danger break-words">{e.message}</p>
                    <p className="text-xs font-display text-text-muted">{timeAgo(e.at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      <p className="t-meta text-text-muted">
        Scores that don&apos;t add up between pages?{' '}
        <Link viewTransition to="/admin/data-check" className="font-display font-semibold text-text underline-offset-2 hover:underline">Open data check</Link>
      </p>
    </div>
  );
};
