import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router';
import { Contact, Users, Building2, Store, Network } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader, Skeleton } from '../../../components';
import { UserList } from '../users';
import { DepartmentList } from '../department';
import { StoreList } from '../store';
import { useUsersQuery, useDepartmentsQuery } from '../hook';
import { useStoresQuery } from '../../tickets/hook';

const OrgStructurePage = lazy(() => import('../orgStructure').then((m) => ({ default: m.OrgStructurePage })));

const TABS = [
  { value: 'users', label: 'Users', short: 'People', icon: Users },
  { value: 'departments', label: 'Departments', short: 'Depts', icon: Building2 },
  { value: 'stores', label: 'Stores', short: 'Stores', icon: Store },
  { value: 'structure', label: 'Org structure', short: 'Structure', icon: Network },
] as const;

type TabValue = (typeof TABS)[number]['value'];

const isTabValue = (v: string | null): v is TabValue => TABS.some((t) => t.value === v);

const summarize = (rows: { isActive: boolean }[] | undefined, offWord: string) => {
  if (!rows) return null;
  const off = rows.filter((r) => !r.isActive).length;
  return off > 0 ? `${rows.length - off} active, ${off} ${offWord}` : 'All active';
};

export const DirectoryPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: TabValue = isTabValue(tabParam) ? tabParam : 'users';
  const setTab = (next: TabValue) => setSearchParams((prev) => {
    const params = new URLSearchParams(prev);
    params.set('tab', next);
    return params;
  }, { replace: true });

  const { data: users } = useUsersQuery();
  const { data: departments } = useDepartmentsQuery();
  const { data: stores } = useStoresQuery();

  const counts: Record<TabValue, number | undefined> = {
    users: users?.length,
    departments: departments?.length,
    stores: stores?.length,
    structure: undefined,
  };

  const summary = tab === 'users' ? summarize(users, 'deactivated')
    : tab === 'departments' ? summarize(departments, 'inactive')
      : tab === 'stores' ? summarize(stores, 'inactive')
        : null;

  return (
    <div className="flex flex-col gap-5 w-full">
      <PageHeader icon={Contact} title="People & Teams" subtitle="Add people, place them in departments and stores, and choose what each person can see." />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)} className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <TabsList className="grid w-full grid-cols-4 gap-1 h-auto rounded-xl p-1 sm:flex sm:w-fit sm:rounded-full">
            {TABS.map(({ value, label, short, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex-col gap-0.5 min-h-12 px-1 py-1.5 rounded-lg t-meta font-display font-semibold sm:flex-row sm:gap-1.5 sm:min-h-8 sm:px-3.5 sm:rounded-full sm:text-sm"
              >
                <Icon className="size-4 sm:size-3.5" aria-hidden />
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{label}</span>
                {counts[value] !== undefined && (
                  <span className="hidden sm:inline t-meta font-medium opacity-70 tabular-nums">{counts[value]}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          {summary && <p className="hidden sm:block t-meta font-display text-text-muted">{summary}</p>}
        </div>

        <TabsContent value="users">
          <UserList />
        </TabsContent>
        <TabsContent value="departments">
          <DepartmentList />
        </TabsContent>
        <TabsContent value="stores">
          <StoreList />
        </TabsContent>
        <TabsContent value="structure">
          <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
            <OrgStructurePage embedded />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
};
