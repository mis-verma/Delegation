import { describe, expect, it } from 'vitest';
import { pastedRowsToCsv } from './pastedTable';

describe('turning pasted spreadsheet rows into CSV', () => {
  it('reads tab separated rows copied from Excel or Google Sheets', () => {
    const pasted = 'Checklist Name\tType\tQuestion\r\nStock\tDaily\tCount the safe\r\nStock\tDaily\tLock the door\r\n';
    expect(pastedRowsToCsv(pasted)).toEqual({
      csv: '"Checklist Name","Type","Question"\r\n"Stock","Daily","Count the safe"\r\n"Stock","Daily","Lock the door"',
      dataRows: 2,
    });
  });

  it('keeps quoted cells with tabs, commas, line breaks and quotes intact', () => {
    const pasted = 'Question\tNote\n"Check ""A"" and B, then C"\t"line one\nline two"\n';
    const result = pastedRowsToCsv(pasted);
    expect(result?.dataRows).toBe(1);
    expect(result?.csv).toBe('"Question","Note"\r\n"Check ""A"" and B, then C","line one\nline two"');
  });

  it('falls back to commas when no tabs are pasted', () => {
    expect(pastedRowsToCsv('Question,Store\nCount,Solan')?.dataRows).toBe(1);
  });

  it('ignores blank lines and refuses a header with no data', () => {
    expect(pastedRowsToCsv('Question\tStore\n\n\t\n')).toBeNull();
    expect(pastedRowsToCsv('just one line of text')).toBeNull();
  });
});
