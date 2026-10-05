import { useSearchParams } from 'react-router';
import { Contact, Users, Building2, Store } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '../../../components';
import { UserList } from '../users';
import { DepartmentList } from '../department';
import { StoreList } from '../store';
import { useUsersQuery, useDepartmentsQuery } from '../hook';
import { useStoresQuery } from '../../tickets/hook';

const TABS = [
  { value: 'users', label: 'Users', icon: Users },
  { value: 'departments', label: 'Departments', icon: Building2 },
  { value: 'stores', label: 'Stores', icon: Store },
] as const;

type TabValue = (typeof TABS)[number]['value'];

// One home for the three entities that make up the org ladder (see Org Structure for the
// read-only combined view of how they relate): each tab is the existing, self-contained
// List component as-is, just no longer scattered across three separate sidebar pages.
const isTabValue = (v: string | null): v is TabValue => TABS.some((t) => t.value === v);

// "42 active, 6 deactivated", or "All active" when nobody is switched off.
const summarize = (rows: { isActive: boolean }[] | undefined, offWord: string) => {
  if (!rows) return null;
  const off = rows.filter((r) => !r.isActive).length;
  return off > 0 ? `${rows.length - off} active, ${off} ${offWord}` : 'All active';
};

// Deep-linkable via ?tab= (e.g. the owner-facing dashboard's snapshot tiles jump straight to
// the Departments/Stores tab instead of always landing on Users). Kept in the URL, not local
// state, so the link is shareable and survives a refresh. The Users tab keeps its own search and
// filters in the same query string, so changing tab leaves them untouched.
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
  };

  const summary = tab === 'users' ? summarize(users, 'deactivated')
    : tab === 'departments' ? summarize(departments, 'inactive')
      : summarize(stores, 'inactive');

  return (
    <div className="flex flex-col gap-5 w-full">
      <PageHeader icon={Contact} title="People & Teams" subtitle="Add people, place them in departments and stores, and choose what each person can see." />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)} className="gap-4">
        {/* Scrolls horizontally instead of clipping the last tab on narrow phones: AdminLayout's
            <main> is overflow-x-hidden, so this row needs its own scroll container. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="overflow-x-auto max-w-full">
            <TabsList className="rounded-full gap-1 h-auto w-fit">
              {TABS.map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="gap-1.5 min-h-11 sm:min-h-8 px-3.5 py-1.5 text-sm rounded-full font-display"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  {counts[value] !== undefined && (
                    <span className="text-xs font-medium opacity-70">{counts[value]}</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {summary && <p className="text-xs font-display text-text-muted">{summary}</p>}
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
      </Tabs>
    </div>
  );
};
