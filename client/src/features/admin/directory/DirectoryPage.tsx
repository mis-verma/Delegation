import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CircleAlert, CircleCheck, Contact, Users, Building2, Store, Network, Radio, Upload, Tag, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button, IconChip, PageHeader, Skeleton } from '../../../components';
import { useAuth } from '../../../context/AuthContext';
import { UserImportModal, UserList } from '../users';
import { DirectoryStats } from './DirectoryStats';
import { countOrg } from './orgCounts';
import { DepartmentList } from '../department';
import { StoreList } from '../store';
import { useUsersQuery, useDepartmentsQuery } from '../hook';
import { useStoresQuery } from '../../tickets/hook';

const PresenceOverview = lazy(() => import('../presence').then((m) => ({ default: m.PresenceOverview })));
const CustomRoleList = lazy(() => import('../customRoles/CustomRoleList').then((m) => ({ default: m.CustomRoleList })));
const OrgStructurePage = lazy(() => import('../orgStructure').then((m) => ({ default: m.OrgStructurePage })));
const CategoryList = lazy(() => import('../../settings/CategoryList').then((m) => ({ default: m.CategoryList })));
const PeopleSettings = lazy(() => import('./PeopleSettings').then((m) => ({ default: m.PeopleSettings })));

const TABS = [
  { value: 'users', label: 'Users', short: 'People', icon: Users },
  { value: 'departments', label: 'Departments', short: 'Depts', icon: Building2 },
  { value: 'stores', label: 'Stores', short: 'Stores', icon: Store },
  { value: 'structure', label: 'Org structure', short: 'Structure', icon: Network },
  { value: 'online', label: "Who's online", short: 'Online', icon: Radio },
  { value: 'categories', label: 'Ticket categories', short: 'Tickets', icon: Tag },
  { value: 'roles', label: 'Roles', short: 'Roles', icon: ShieldCheck },
  { value: 'settings', label: 'Settings', short: 'Settings', icon: SlidersHorizontal },
] as const;

type TabValue = (typeof TABS)[number]['value'];

const TAB_ROLES: Partial<Record<TabValue, readonly string[]>> = {
  categories: ['ADMIN', 'PC'],
  roles: ['ADMIN'],
  settings: ['ADMIN'],
};

const summarize = (rows: { isActive: boolean }[] | undefined, offWord: string) => {
  if (!rows) return null;
  const off = rows.filter((r) => !r.isActive).length;
  return off > 0 ? `${rows.length - off} active, ${off} ${offWord}` : 'All active';
};

export const DirectoryPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const visibleTabs = TABS.filter((t) => !TAB_ROLES[t.value] || (!!user && TAB_ROLES[t.value]!.includes(user.role)));
  const tabParam = searchParams.get('tab');
  const tab: TabValue = visibleTabs.find((t) => t.value === tabParam)?.value ?? 'users';
  const setTab = (next: TabValue) => setSearchParams(new URLSearchParams({ tab: next }), { replace: true });

  const [importing, setImporting] = useState(false);
  const { data: users } = useUsersQuery();
  const { data: departments } = useDepartmentsQuery();
  const { data: stores } = useStoresQuery();

  const org = countOrg(users, departments, stores);
  const counts: Record<TabValue, number | undefined> = {
    users: users ? org.activePeople : undefined,
    departments: departments ? org.activeDepartments : undefined,
    stores: stores ? org.activeStores : undefined,
    structure: undefined,
    online: undefined,
    categories: undefined,
    roles: undefined,
    settings: undefined,
  };

  const summary = tab === 'users' ? summarize(users, 'deactivated')
    : tab === 'departments' ? summarize(departments, 'inactive')
      : tab === 'stores' ? summarize(stores, 'inactive')
        : null;

  return (
    <div className="flex flex-col gap-5 w-full">
      <PageHeader
        icon={Contact}
        title="People & Teams"
        subtitle="Add people, place them in departments and stores, and choose what each person can see."
        actions={user?.role === 'ADMIN' ? (
          <Button variant="outline" size="sm" onClick={() => setImporting(true)} className="gap-1.5 max-sm:h-11">
            <Upload size={15} aria-hidden="true" />
            Import people
          </Button>
        ) : undefined}
      />

      <DirectoryStats />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)} className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <TabsList className="grid w-full grid-cols-4 gap-1 h-auto rounded-xl p-1 sm:flex sm:w-fit sm:flex-wrap sm:rounded-full">
            {visibleTabs.map(({ value, label, short, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex-col gap-0.5 min-h-12 px-1 py-1.5 rounded-lg t-meta font-display font-semibold sm:flex-row sm:gap-1.5 sm:min-h-8 sm:px-3.5 sm:rounded-full sm:text-sm"
              >
                <Icon className="size-4 sm:size-3.5" aria-hidden />
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{label}</span>
                {counts[value] !== undefined && (
                  <span className="hidden sm:inline-flex min-w-5 items-center justify-center rounded-full bg-text/8 px-1.5 t-meta font-display font-bold tabular-nums">{counts[value]}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          {summary && <IconChip className="hidden sm:inline-flex" icon={summary === 'All active' ? CircleCheck : CircleAlert} tone={summary === 'All active' ? 'bg-success' : 'bg-warning'} label={summary} soft />}
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
        <TabsContent value="online">
          <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
            <PresenceOverview />
          </Suspense>
        </TabsContent>
        <TabsContent value="categories">
          <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
            <CategoryList />
          </Suspense>
        </TabsContent>
        <TabsContent value="roles">
          <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
            <CustomRoleList />
          </Suspense>
        </TabsContent>
        <TabsContent value="settings">
          <Suspense fallback={<Skeleton className="h-48 max-w-xl rounded-2xl" />}>
            <PeopleSettings />
          </Suspense>
        </TabsContent>
        <TabsContent value="structure">
          <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
            <OrgStructurePage embedded />
          </Suspense>
        </TabsContent>
      </Tabs>

      {importing && <UserImportModal onClose={() => setImporting(false)} />}
    </div>
  );
};
