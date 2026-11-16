import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Maximize2, Minimize2, Minus, Plus, ScanLine, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, ColorIconTile, EmptyState, IconChip, PANEL_CLASS } from '../../../components';
import { Search as SearchIcon } from 'lucide-react';
import type { AdminUser, UserPresence } from '../../../api/admin';
import type { Department } from '../../../api/departments';
import type { Store as StoreRow } from '../../../api/stores';
import { PersonBranch, type TreeContext } from './OrgPersonNode';
import { PersonDrawer } from './PersonDrawer';
import { buildPeopleTree, deptKey, searchPeople, storeKey, type DepartmentBranch, type PeopleTree, type StoreBranch } from './peopleTree';

const ZOOM_STEPS = [0.7, 0.8, 0.9, 1, 1.1, 1.25] as const;
const DEFAULT_ZOOM_INDEX = 3;

interface OrgTreeViewProps {
  stores: readonly StoreRow[];
  departments: readonly Department[];
  users: readonly AdminUser[];
  presence: readonly UserPresence[] | undefined;
  query: string;
  showDeactivated: boolean;
}

const allBranchKeys = (tree: PeopleTree): Set<string> => new Set(tree.hasChildren);

const defaultOpenKeys = (tree: PeopleTree): Set<string> => {
  const keys = new Set<string>();
  for (const store of tree.stores) {
    keys.add(storeKey(store.store?.id ?? null));
    for (const department of store.departments) keys.add(deptKey(department.id));
  }
  return keys;
};

const Header = ({ title, count, online, open, onToggle, tile }: { title: string; count: number; online?: number; open: boolean; onToggle: () => void; tile: 'store' | 'department' }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-expanded={open}
    className={cn(
      'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-surface px-3 py-2 text-left outline-none transition-colors duration-150 hover:border-border-hover focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.995]',
      tile === 'store' && 'bg-surface-hover/40',
    )}
  >
    <ChevronRight className={cn('size-4 shrink-0 text-text-muted transition-transform duration-150 ease-out', open && 'rotate-90')} aria-hidden />
    <ColorIconTile icon={Store} name={title} size="sm" />
    <span className="min-w-0 flex-1 line-clamp-2 break-words t-card font-display font-bold leading-snug text-text">{title}</span>
    {online !== undefined && online > 0 && (
      <span className="hidden shrink-0 items-center gap-1.5 t-meta font-display font-semibold text-success sm:flex">
        <span className="live-dot size-1.5 rounded-full bg-success" aria-hidden />
        {online} online
      </span>
    )}
    <IconChip icon={false} label={`${count} ${count === 1 ? 'person' : 'people'}`} labelClassName="tabular-nums" />
  </button>
);

export const OrgTreeView = ({ stores, departments, users, presence, query, showDeactivated }: OrgTreeViewProps) => {
  const tree = useMemo(() => buildPeopleTree(stores, departments, users, showDeactivated), [stores, departments, users, showDeactivated]);
  const search = useMemo(() => searchPeople(tree, query), [tree, query]);
  const online = useMemo(() => new Set((presence ?? []).filter((p) => p.online).map((p) => p.id)), [presence]);
  const storeNames = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores]);
  const departmentNames = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  const [expanded, setExpanded] = useState<Set<string> | null>(null);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const baseOpen = useMemo(() => expanded ?? defaultOpenKeys(tree), [expanded, tree]);
  const isOpen = useCallback((key: string) => baseOpen.has(key) || search.open.has(key), [baseOpen, search.open]);
  const onToggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev ?? baseOpen);
      if (next.has(key) || search.open.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, [baseOpen, search.open]);

  useEffect(() => {
    if (!search.first) return;
    document.getElementById(`org-node-${search.first}`)?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [search.first]);

  const ctx = useMemo<TreeContext>(() => ({
    isOpen,
    onToggle,
    onOpen: setOpenUserId,
    matches: search.matches,
    online,
    storeName: (id) => (id ? storeNames.get(id) : undefined),
    departmentName: (id) => (id ? departmentNames.get(id) : undefined),
  }), [isOpen, onToggle, search.matches, online, storeNames, departmentNames]);

  const zoom = ZOOM_STEPS[zoomIndex] ?? 1;
  const fit = () => {
    const frame = frameRef.current;
    if (!frame) return;
    const ratio = frame.clientWidth / Math.max(frame.scrollWidth, 1);
    const target = zoom * Math.min(ratio, 1);
    const best = ZOOM_STEPS.filter((step) => step <= Math.max(target, ZOOM_STEPS[0])).pop() ?? ZOOM_STEPS[0];
    setZoomIndex(ratio >= 1 ? DEFAULT_ZOOM_INDEX : ZOOM_STEPS.indexOf(best));
    frame.scrollTo({ top: 0, left: 0 });
  };

  const peopleOnlineIn = (branch: StoreBranch | DepartmentBranch): number => {
    const departmentsOf = 'departments' in branch ? branch.departments : [branch];
    let total = 0;
    const walk = (list: DepartmentBranch['leads']) => list.forEach((n) => { if (online.has(n.id)) total += 1; walk(n.reports); });
    departmentsOf.forEach((d) => walk(d.leads));
    return total;
  };

  if (tree.stores.length === 0 && tree.floating.length === 0) {
    return <EmptyState icon={SearchIcon} title="Nothing to show" description="Add stores and departments, then place people in them to see the tree." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Tree controls">
        <Button variant="outline" size="sm" onClick={() => setExpanded(allBranchKeys(tree))} className="max-sm:h-11">
          <Maximize2 className="size-3.5" aria-hidden /> Expand all
        </Button>
        <Button variant="outline" size="sm" onClick={() => setExpanded(new Set())} className="max-sm:h-11">
          <Minimize2 className="size-3.5" aria-hidden /> Collapse all
        </Button>
        <span className="flex items-center gap-1 sm:ml-auto" role="group" aria-label="Zoom">
          <Button variant="outline" size="sm" aria-label="Zoom out" disabled={zoomIndex === 0} onClick={() => setZoomIndex((i) => Math.max(0, i - 1))} className="size-11 px-0 sm:size-8">
            <Minus className="size-3.5" aria-hidden />
          </Button>
          <span className="min-w-12 text-center t-meta font-display font-semibold tabular-nums text-text-secondary" aria-live="polite">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="sm" aria-label="Zoom in" disabled={zoomIndex === ZOOM_STEPS.length - 1} onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))} className="size-11 px-0 sm:size-8">
            <Plus className="size-3.5" aria-hidden />
          </Button>
          <Button variant="outline" size="sm" onClick={fit} aria-label="Fit to screen" className="max-sm:h-11">
            <ScanLine className="size-3.5" aria-hidden /> Fit
          </Button>
        </span>
      </div>

      <div ref={frameRef} className={cn(PANEL_CLASS, 'max-h-[min(72svh,56rem)] overflow-auto overscroll-contain p-3 sm:p-4')}>
        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: `${100 / zoom}%` }} className="flex flex-col gap-4">
          {tree.stores.map((store) => {
            const sKey = storeKey(store.store?.id ?? null);
            const storeOpen = isOpen(sKey);
            return (
              <section key={sKey} aria-label={store.store?.name ?? 'No store'} className="flex flex-col gap-2">
                <Header title={store.store?.name ?? 'No store'} count={store.headcount} online={peopleOnlineIn(store)} open={storeOpen} onToggle={() => onToggle(sKey)} tile="store" />
                {storeOpen && (
                  <div className="flex flex-col gap-3 border-l border-border/60 pl-3 sm:pl-5">
                    {store.departments.map((department) => {
                      const dKey = deptKey(department.id);
                      const deptOpen = isOpen(dKey);
                      return (
                        <div key={dKey} className="flex flex-col gap-2">
                          <Header title={department.department.name} count={department.headcount} online={peopleOnlineIn(department)} open={deptOpen} onToggle={() => onToggle(dKey)} tile="department" />
                          {deptOpen && (
                            department.leads.length > 0 ? (
                              <ul className="flex flex-col gap-2 border-l border-border/60 pl-3 sm:pl-5">
                                {department.leads.map((node) => <PersonBranch key={node.id} node={node} ctx={ctx} />)}
                              </ul>
                            ) : (
                              <p className="border-l border-border/60 pl-3 t-meta font-display text-text-muted sm:pl-5">Nobody in this department yet.</p>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}

          {tree.floating.length > 0 && (
            <section aria-label="People without a department" className="flex flex-col gap-2">
              <p className="t-card font-display font-bold text-text">Not in a department <span className="t-meta font-semibold tabular-nums text-text-muted">{tree.floating.length}</span></p>
              <ul className="flex flex-col gap-2">
                {tree.floating.map((node) => <PersonBranch key={node.id} node={node} ctx={ctx} />)}
              </ul>
            </section>
          )}
        </div>
      </div>

      <PersonDrawer
        userId={openUserId}
        tree={tree}
        stores={stores}
        departments={departments}
        online={online}
        onClose={() => setOpenUserId(null)}
        onOpenUser={setOpenUserId}
      />
    </div>
  );
};
