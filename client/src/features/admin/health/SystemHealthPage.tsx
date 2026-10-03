import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Database, HardDrive, HeartPulse, Layers, RefreshCw, Server, TriangleAlert, XCircle } from 'lucide-react';
import { Button, GradientIconTile, Skeleton } from '../../../components';
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

const LEVEL_TONE: Record<HealthLevel, { text: string; bg: string; icon: ReactNode; label: string }> = {
  ok: { text: 'text-success', bg: 'bg-success/10', icon: <CheckCircle2 size={14} aria-hidden />, label: 'Healthy' },
  warn: { text: 'text-warning', bg: 'bg-warning/10', icon: <TriangleAlert size={14} aria-hidden />, label: 'Needs a look' },
  down: { text: 'text-danger', bg: 'bg-danger/10', icon: <XCircle size={14} aria-hidden />, label: 'Down' },
};

const JOB_TONE: Record<HealthJobStatus, { level: HealthLevel | 'idle'; label: string }> = {
  ok: { level: 'ok', label: 'Running' },
  late: { level: 'warn', label: 'Late' },
  failing: { level: 'down', label: 'Failing' },
  waiting: { level: 'idle', label: 'Not run yet' },
};

const Pill = ({ level, label }: { level: HealthLevel | 'idle'; label?: string }) => {
  const tone = level === 'idle' ? { text: 'text-text-muted', bg: 'bg-surface-hover', icon: null, label: 'Waiting' } : LEVEL_TONE[level];
  return (
    <span className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-display font-semibold ${tone.bg} ${tone.text}`}>
      {tone.icon}
      {label ?? tone.label}
    </span>
  );
};

const Tile = ({ icon, title, level, children }: { icon: ReactNode; title: string; level: HealthLevel; children: ReactNode }) => (
  <section className="flex flex-col gap-3 p-4 rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface">
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-display font-semibold text-text">
        <span className="text-text-muted">{icon}</span>
        {title}
      </h2>
      <Pill level={level} />
    </div>
    <div className="flex flex-col gap-1 text-xs font-display text-text-muted">{children}</div>
  </section>
);

const Stat = ({ value, label }: { value: string; label: string }) => (
  <p className="flex items-baseline gap-1.5">
    <span className="text-base font-display font-bold text-text tabular-nums">{value}</span>
    <span>{label}</span>
  </p>
);

const JobRow = ({ job }: { job: HealthJob }) => {
  const tone = JOB_TONE[job.status];
  return (
    <li className="flex flex-col gap-1.5 p-3.5 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-display font-semibold text-text leading-snug">{job.name.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase())}</p>
        <p className="text-xs font-display text-text-muted">
          {job.status === 'waiting' ? 'Has not run since the server started' : `Last run ${timeAgo(job.lastRunAt)}${job.lastDurationMs != null ? `, took ${duration(job.lastDurationMs)}` : ''}`}
          {job.failures > 0 && ` · ${job.failures} failed of ${job.runs}`}
        </p>
        {job.lastError && <p className="mt-1 text-xs font-display text-danger break-words">{job.lastError}</p>}
      </div>
      <Pill level={tone.level} label={tone.label} />
    </li>
  );
};

const Banner = ({ health }: { health: SystemHealth }) => {
  const down = health.overall === 'down';
  const ok = health.overall === 'healthy';
  const tone = ok ? 'border-success/25 bg-success/10 text-success' : down ? 'border-danger/25 bg-danger/10 text-danger' : 'border-warning/25 bg-warning/10 text-warning';
  return (
    <div className={`flex items-start gap-3 p-4 rounded-2xl border ${tone}`} role="status">
      <span className="mt-0.5 shrink-0">{ok ? <CheckCircle2 size={18} /> : <TriangleAlert size={18} />}</span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-display font-semibold">
          {ok ? 'Everything is running fine' : down ? 'The system is down' : `${health.attention.length} ${health.attention.length === 1 ? 'thing needs' : 'things need'} a look`}
        </p>
        {health.attention.map(item => (
          <p key={item} className="text-xs font-display leading-relaxed">{item}</p>
        ))}
      </div>
    </div>
  );
};

export const SystemHealthPage = () => {
  const { data: health, isPending, isError, isFetching, refetch, dataUpdatedAt } = useSystemHealthQuery();

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <GradientIconTile icon={HeartPulse} />
          <div>
            <h1 className="text-xl font-display font-bold text-text">System Health</h1>
            <p className="text-sm text-text-muted mt-0.5">
              {dataUpdatedAt ? `Checked ${timeAgo(new Date(dataUpdatedAt).toISOString())}. Refreshes every 30 seconds.` : 'Checking now.'}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Check now
        </Button>
      </div>

      {isError && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-danger/10 border border-danger/20 text-xs text-danger font-display">
          <AlertCircle size={16} className="shrink-0" />
          We couldn't reach the server to check. If this page won't load, the server itself may be down.
        </div>
      )}

      {isPending && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
        </div>
      )}

      {health && (
        <>
          <Banner health={health} />

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
            <h2 className="text-sm font-display font-semibold text-text">Background jobs</h2>
            {health.jobs.length === 0 ? (
              <p className="text-xs font-display text-text-muted">No background jobs are registered on this server.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border/60 rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface overflow-hidden">
                {health.jobs.map(job => <JobRow key={job.name} job={job} />)}
              </ul>
            )}
          </section>

          {health.database.biggestTables.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <h2 className="text-sm font-display font-semibold text-text">Where the data lives</h2>
              <ul className="flex flex-col gap-2 p-4 rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface">
                {health.database.biggestTables.map(t => {
                  const max = health.database.biggestTables[0].sizeMb || 1;
                  return (
                    <li key={t.name} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-xs font-display">
                      <span className="truncate text-text-secondary" title={t.name}>{t.name}</span>
                      <span className="h-2 rounded-full bg-surface-hover overflow-hidden">
                        <span className="block h-full rounded-full bg-primary-500" style={{ width: `${Math.max(3, (t.sizeMb / max) * 100)}%` }} />
                      </span>
                      <span className="text-text-muted tabular-nums">{t.sizeMb} MB · {t.rows.toLocaleString()} rows</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-2.5">
            <h2 className="text-sm font-display font-semibold text-text">Recent server errors</h2>
            {health.errors.length === 0 ? (
              <p className="text-xs font-display text-text-muted">No unexpected errors since the server last restarted.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border/60 rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface overflow-hidden">
                {health.errors.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="flex flex-col gap-0.5 p-3.5">
                    <p className="text-xs font-display font-semibold text-text break-all">{e.method} {e.path}</p>
                    <p className="text-xs font-display text-danger break-words">{e.message}</p>
                    <p className="text-[11px] font-display text-text-muted">{timeAgo(e.at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
};
