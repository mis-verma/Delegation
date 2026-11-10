export const formatCount = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1));

export const COUNT_HEAD_CLASS = 'w-32 min-w-32 px-3 py-2.5 text-right t-meta font-display font-semibold text-text-secondary whitespace-nowrap';
export const COUNT_CELL_CLASS = 'w-32 min-w-32 px-3 py-2 text-right align-middle';

export const countText = (done: number | undefined, due: number | undefined) =>
  done === undefined || due === undefined || due === 0 ? '' : `${formatCount(done)}/${formatCount(due)}`;
