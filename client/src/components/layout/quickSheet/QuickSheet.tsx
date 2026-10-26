import { useNavigate } from 'react-router';
import { ClipboardCheck, ClipboardList, ListTodo, Plus, TicketCheck, X, type LucideIcon } from 'lucide-react';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '../../ui/sheet';
import { Button } from '../../button';
import { useNow } from '../../../lib/useNow';
import { QuickTodos } from './QuickTodos';
import { QuickTasks } from './QuickTasks';
import { QuickTickets } from './QuickTickets';
import { QuickChecklists } from './QuickChecklists';

export type QuickModule = '/tickets' | '/tasks' | '/todo' | '/checklists';

interface ModuleLook {
  title: string;
  icon: LucideIcon;
  openLabel: string;
  create: { to: string; label: string } | null;
}

const MODULES: Record<QuickModule, ModuleLook> = {
  '/tickets': { title: 'Tickets', icon: TicketCheck, openLabel: 'Open all tickets', create: { to: '/tickets?create=1', label: 'New ticket' } },
  '/tasks': { title: 'Delegation', icon: ClipboardList, openLabel: 'Open all delegations', create: { to: '/tasks?create=1', label: 'New delegation' } },
  '/todo': { title: 'To-Do', icon: ListTodo, openLabel: 'Open all to-dos', create: null },
  '/checklists': { title: 'Checklists', icon: ClipboardCheck, openLabel: 'Open all checklists', create: null },
};

interface QuickSheetProps {
  open: boolean;
  module: QuickModule;
  summary: string;
  onClose: () => void;
}

const QuickSheet = ({ open, module, summary, onClose }: QuickSheetProps) => {
  const now = useNow();
  const navigate = useNavigate();
  const go = (to: string) => {
    onClose();
    void navigate(to, { viewTransition: true });
  };
  const look = MODULES[module];
  const Icon = look.icon;
  const panel = { now, onClose };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[88dvh] gap-0 rounded-t-2xl p-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-none"
      >
        <span aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" />
        <div className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary-500 to-primary-700 text-white" aria-hidden="true">
            <Icon className="size-5" strokeWidth={2.25} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <SheetTitle className="t-section font-display font-bold text-text">{look.title}</SheetTitle>
            <SheetDescription className="t-meta font-medium text-text-muted">{summary || 'Nothing pending'}</SheetDescription>
          </div>
          <SheetClose
            aria-label="Close"
            className="flex size-10 pointer-coarse:size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-muted outline-none transition-colors duration-150 hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <X size={18} strokeWidth={2.5} aria-hidden="true" />
          </SheetClose>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {module === '/todo' && <QuickTodos {...panel} />}
          {module === '/tasks' && <QuickTasks {...panel} />}
          {module === '/tickets' && <QuickTickets {...panel} />}
          {module === '/checklists' && <QuickChecklists {...panel} />}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-border/60 px-3 pt-3">
          {look.create && (
            <Button type="button" variant="outline" size="lg" className="flex-1" onClick={() => go(look.create!.to)}>
              <Plus className="size-4" strokeWidth={2.5} aria-hidden="true" />
              {look.create.label}
            </Button>
          )}
          <Button type="button" size="lg" className="flex-1" onClick={() => go(module)}>
            {look.openLabel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default QuickSheet;
