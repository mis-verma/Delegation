import { useSearchParams } from 'react-router';
import { Contact, Users, Building2, Store } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
// read-only combined view of how they relate) — each tab is the existing, self-contained
// List component as-is, just no longer scattered across three separate sidebar pages.
const isTabValue = (v: string | null): v is TabValue => TABS.some((t) => t.value === v);

// Deep-linkable via ?tab= (e.g. the owner-facing dashboard's snapshot tiles jump straight to
// the Departments/Stores tab instead of always landing on Users) — kept in the URL, not local
// state, so the link is shareable and survives a refresh.
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
  const totalCount = (users?.length ?? 0) + (departments?.length ?? 0) + (stores?.length ?? 0);

  return (
    <div className="flex flex-col gap-5 w-full">
      <header className="flex items-start gap-4 pb-5 border-b border-border">
        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500/10 to-primary-700/10 dark:from-primary-500/20 dark:to-primary-700/20 text-primary-600 dark:text-primary-400 ring-1 ring-primary-500/20 shadow-sm shrink-0">
          <Contact className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight text-text">People &amp; Teams</h1>
            <span className="flex items-center justify-center px-2.5 py-0.5 text-xs font-display font-bold bg-surface-hover text-text-secondary rounded-full border border-border">
              {totalCount}
            </span>
          </div>
          <p className="text-xs sm:text-sm font-display text-text-muted max-w-lg leading-relaxed">
            Manage users, departments, and stores in one place.
          </p>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
        {/* Scrolls horizontally instead of clipping the last tab on narrow phones — AdminLayout's
            <main> is overflow-x-hidden, so this row needs its own scroll container. */}
        <div className="overflow-x-auto">
          <TabsList className="bg-surface-hover p-1 rounded-full gap-1 h-auto w-fit">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="gap-1.5 px-3.5 py-1.5 text-sm rounded-full font-display transition-all duration-300 data-[state=active]:bg-primary-700 data-[state=active]:text-white data-[state=active]:shadow-md"
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

        <TabsContent value="users" className="pt-4">
          <UserList />
        </TabsContent>
        <TabsContent value="departments" className="pt-4">
          <DepartmentList />
        </TabsContent>
        <TabsContent value="stores" className="pt-4">
          <StoreList />
        </TabsContent>
      </Tabs>
    </div>
  );
};
