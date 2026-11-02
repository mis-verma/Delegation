const DEFAULT_HEADER = ['Title', 'Description', 'Category', 'Department', 'Person', 'Due date', 'Priority', 'Store', 'Labels'];

const parseTabs = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === '\t') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
};

const HEADER_WORDS = ['title', 'subject', 'ticket title'];

export const pastedRowsToCsvFile = (text: string): File | null => {
  const grid = parseTabs(text.trim());
  if (grid.length === 0) return null;
  const first = (grid[0]?.[0] ?? '').trim().toLowerCase();
  const withHeader = HEADER_WORDS.includes(first) ? grid : [DEFAULT_HEADER, ...grid];
  if (withHeader.length < 2) return null;
  const csv = withHeader.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
  return new File([csv], 'pasted-tickets.csv', { type: 'text/csv' });
};
