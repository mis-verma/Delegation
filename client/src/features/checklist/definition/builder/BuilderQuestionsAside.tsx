import { useState } from 'react';
import { PlusCircle, Smartphone } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { PANEL_CLASS } from '../../../../components';
import { QuestionTypePalette } from './QuestionTypePalette';
import { ChecklistPhonePreview } from './ChecklistPhonePreview';
import type { ItemDraft } from '../ChecklistDefinitionItemDraftRow';

interface BuilderQuestionsAsideProps {
  onAdd: (patch: Partial<ItemDraft>) => boolean;
  storeIds?: string[];
  name: string;
  itemDrafts: ItemDraft[];
  activeKey: string | null;
}

const TRIGGER = 'flex-1 gap-1.5 rounded-full t-meta font-display font-semibold min-h-9 pointer-coarse:min-h-11 data-[state=active]:shadow-sm';

export const BuilderQuestionsAside = ({ onAdd, storeIds, name, itemDrafts, activeKey }: BuilderQuestionsAsideProps) => {
  const [tab, setTab] = useState<'add' | 'preview'>('add');

  return (
    <div className={cn(PANEL_CLASS, 'order-last xl:order-first p-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh_-_9rem)] flex flex-col gap-3 min-h-0 shadow-inner bg-gradient-to-b from-surface to-surface-hover/30')}>
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'add' | 'preview')} className="flex min-h-0 flex-1 flex-col gap-3">
        <TabsList className="w-full shrink-0 rounded-full p-1 shadow-xs">
          <TabsTrigger value="add" className={TRIGGER}>
            <PlusCircle size={14} aria-hidden />
            Add
          </TabsTrigger>
          <TabsTrigger value="preview" className={TRIGGER}>
            <Smartphone size={14} aria-hidden />
            Preview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="add" className="min-h-0 xl:overflow-y-auto">
          <QuestionTypePalette onAdd={onAdd} storeIds={storeIds} compact />
        </TabsContent>

        <TabsContent value="preview" className="min-h-0 flex-1 px-1 py-2">
          <ChecklistPhonePreview
            name={name}
            itemDrafts={itemDrafts}
            activeKey={activeKey}
            className="max-h-[32rem] xl:max-h-[calc(100dvh_-_15rem)]"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
