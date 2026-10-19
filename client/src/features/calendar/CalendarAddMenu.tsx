import type { ReactNode } from 'react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { CALENDAR_ITEM_DOT_CLASS, CALENDAR_ITEM_ICON, type CalendarCreateKind } from './calendarDisplay';

const OPTIONS: { kind: CalendarCreateKind; title: string; hint: string }[] = [
  { kind: 'delegation', title: 'New delegation', hint: 'Give someone work with a due date' },
  { kind: 'ticket', title: 'New ticket', hint: 'Raise an issue or request' },
];

interface CalendarAddMenuProps {
  trigger: ReactNode;
  onPick: (kind: CalendarCreateKind) => void;
  align?: 'start' | 'center' | 'end';
}

export const CalendarAddMenu = ({ trigger, onPick, align = 'end' }: CalendarAddMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
    <DropdownMenuContent align={align} sideOffset={8} className="w-72 max-w-[calc(100vw-2rem)] rounded-xl p-1.5">
      {OPTIONS.map(({ kind, title, hint }) => {
        const Icon = CALENDAR_ITEM_ICON[kind];
        return (
          <DropdownMenuItem key={kind} onClick={() => onPick(kind)} className="gap-3 px-2 py-2 min-h-12 rounded-lg cursor-pointer">
            <span className={`flex items-center justify-center size-9 rounded-lg shrink-0 ${CALENDAR_ITEM_DOT_CLASS[kind]}`}>
              <Icon size={16} strokeWidth={2.5} className="text-white!" />
            </span>
            <span className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-display font-semibold text-text">{title}</span>
              <span className="t-meta text-text-muted leading-snug">{hint}</span>
            </span>
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuContent>
  </DropdownMenu>
);
