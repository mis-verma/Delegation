import { useState } from 'react';
import { List, ShieldQuestion } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CustomRoleList } from './CustomRoleList';
import { AccessSimulatorPanel } from '../accessSimulator/AccessSimulatorPanel';

type SubTab = 'manage' | 'guide';

export const RolesPage = () => {
  const [tab, setTab] = useState<SubTab>('manage');

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as SubTab)} className="gap-4">
      <TabsList className="w-fit rounded-full p-1">
        <TabsTrigger value="manage" className="gap-1.5 rounded-full px-3.5">
          <List size={14} aria-hidden />
          Manage roles
        </TabsTrigger>
        <TabsTrigger value="guide" className="gap-1.5 rounded-full px-3.5">
          <ShieldQuestion size={14} aria-hidden />
          Access guide
        </TabsTrigger>
      </TabsList>

      <TabsContent value="manage">
        <CustomRoleList />
      </TabsContent>
      <TabsContent value="guide">
        <AccessSimulatorPanel />
      </TabsContent>
    </Tabs>
  );
};
