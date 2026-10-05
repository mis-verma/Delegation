/**
 * The ticket card grid, shared by the real list and its skeleton so nothing reflows when data
 * arrives. One column on phones, two from `sm`, then `lg` and up fill the row with as many
 * columns of at least 17rem as fit (typically 2, then 3, then 4 as the content area widens), so a
 * card never gets squeezed and a wide screen never leaves a gutter.
 */
export const TICKET_GRID_CLASS =
  'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3 sm:gap-4';
