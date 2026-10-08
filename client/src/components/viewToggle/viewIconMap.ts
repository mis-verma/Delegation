import { BoardViewIcon, CardsViewIcon, ListViewIcon, TableViewIcon, TimelineViewIcon, type ViewIcon } from './viewIcons';

/** Solid icon for the view keys every list page uses. A key not listed here keeps the icon its tab passes. */
export const VIEW_ICONS: Record<string, ViewIcon> = {
  board: BoardViewIcon,
  list: ListViewIcon,
  table: TableViewIcon,
  timeline: TimelineViewIcon,
  cards: CardsViewIcon,
};
