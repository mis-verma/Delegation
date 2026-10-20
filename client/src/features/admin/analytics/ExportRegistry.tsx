import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ExportMenu, type ExportMenuProps, type ExportSource } from '../../../components';
import type { TableRows } from '../../../lib/exportTable';

interface Entry {
  id: string;
  filename: string;
  sheetName?: string;
  label?: string;
  title?: ExportSource['title'];
  disabled: boolean;
  getRows: ExportSource['getRows'];
}

interface Registry {
  register: (entry: Entry) => void;
  unregister: (id: string) => void;
  entries: Entry[];
}

const RegistryContext = createContext<Registry | null>(null);

const ORDER = ['overview-at-a-glance', 'overview-waiting-for-approval', 'overview-leaders', 'overview-leaderboard'];
const rank = (filename: string) => {
  const index = ORDER.indexOf(filename);
  return index === -1 ? ORDER.length : index;
};

export const ExportRegistryProvider = ({ children }: { children: ReactNode }) => {
  const [map, setMap] = useState<Record<string, Entry>>({});
  const register = useCallback((entry: Entry) => setMap((m) => ({ ...m, [entry.id]: entry })), []);
  const unregister = useCallback((id: string) => setMap((m) => {
    if (!(id in m)) return m;
    const next = { ...m };
    delete next[id];
    return next;
  }), []);
  const value = useMemo<Registry>(
    () => ({ register, unregister, entries: Object.values(map).sort((a, b) => rank(a.filename) - rank(b.filename)) }),
    [register, unregister, map],
  );
  return <RegistryContext.Provider value={value}>{children}</RegistryContext.Provider>;
};

export const SectionExport = (props: ExportMenuProps) => {
  const registry = useContext(RegistryContext);
  const id = useId();
  const latest = useRef({ getRows: props.getRows, title: props.title });
  const { filename, sheetName, label, disabled = false } = props;
  const titleKey = JSON.stringify(props.title ?? null);
  const register = registry?.register;
  const unregister = registry?.unregister;

  useEffect(() => {
    latest.current = { getRows: props.getRows, title: props.title };
  });

  useEffect(() => {
    if (!register || !unregister) return;
    register({ id, filename, sheetName, label, title: latest.current.title, disabled, getRows: () => latest.current.getRows() });
    return () => unregister(id);
  }, [register, unregister, id, filename, sheetName, label, titleKey, disabled]);

  if (registry) return null;
  return <ExportMenu {...props} iconOnly />;
};

export const OverviewExportMenu = () => {
  const registry = useContext(RegistryContext);
  const entries = registry?.entries ?? [];
  const ready = entries.filter((e) => !e.disabled);
  const toSource = (e: Entry): ExportSource => ({ filename: e.filename, sheetName: e.sheetName, title: e.title, getRows: e.getRows, label: e.label ?? e.sheetName });
  const combined: ExportSource | null = ready.length > 1
    ? {
        filename: 'overview-everything',
        sheetName: 'Overview',
        label: 'Everything in one file',
        title: ready[0].title,
        getRows: async () => {
          const rows: (string | number | null | undefined)[][] = [];
          let count = 0;
          for (const entry of ready) {
            const table = await entry.getRows();
            const counted = 'rows' in table ? table : null;
            const body: TableRows = 'rows' in table ? table.rows : table;
            count += counted ? counted.count : Math.max(0, body.length - 1);
            if (rows.length) rows.push([]);
            rows.push([entry.label ?? entry.sheetName ?? entry.filename]);
            for (const row of body) rows.push([...row]);
          }
          return { rows, count };
        },
      }
    : null;
  const sources = combined ? [combined, ...ready.map(toSource)] : ready.map(toSource);
  const [first, ...rest] = sources;

  return (
    <ExportMenu
      aria-label="Export the figures on this page"
      disabled={!first}
      {...(first ?? { filename: 'overview', getRows: () => [] })}
      more={rest}
    />
  );
};
