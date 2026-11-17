import { describe, expect, it } from 'vitest';
import { buildSearchIndex, filterOptions, matchedKeyword, searchTerms } from './optionFilter';
import { matchSpans } from './highlightTerms';

const options = [
  { value: 'a', label: 'Issue Ticket', group: 'IT', keywords: ['Printer not working', 'Wi-Fi down'] },
  { value: 'b', label: 'Housekeeping', group: 'Operations' },
  { value: 'c', label: 'Billing', group: 'Accounts', hint: 'Due in 2d' },
];

describe('searching a dropdown', () => {
  it('keeps every option when nothing is typed', () => {
    expect(filterOptions(options, '')).toHaveLength(3);
    expect(filterOptions(options, '   ')).toHaveLength(3);
  });

  it('finds an option by its own name, whatever the case', () => {
    expect(filterOptions(options, 'bill').map((o) => o.value)).toEqual(['c']);
    expect(filterOptions(options, 'HOUSE').map((o) => o.value)).toEqual(['b']);
  });

  it('finds an option by its group or its hint', () => {
    expect(filterOptions(options, 'accounts').map((o) => o.value)).toEqual(['c']);
    expect(filterOptions(options, '2d').map((o) => o.value)).toEqual(['c']);
  });

  it('finds a category by the problem inside it', () => {
    expect(filterOptions(options, 'printer').map((o) => o.value)).toEqual(['a']);
    expect(filterOptions(options, 'wi-fi').map((o) => o.value)).toEqual(['a']);
  });

  it('needs every word to match, in any order', () => {
    expect(filterOptions(options, 'printer working').map((o) => o.value)).toEqual(['a']);
    expect(filterOptions(options, 'working printer').map((o) => o.value)).toEqual(['a']);
    expect(filterOptions(options, 'printer billing')).toHaveLength(0);
  });

  it('gives the same answer with or without a prebuilt index', () => {
    const index = buildSearchIndex(options);
    expect(filterOptions(options, 'printer', index)).toEqual(filterOptions(options, 'printer'));
    expect(filterOptions(options, 'printer', ['wrong', 'size'])).toEqual(filterOptions(options, 'printer'));
  });

  it('says which problem made a category match', () => {
    const terms = searchTerms('printer');
    expect(matchedKeyword(options[0], terms)).toBe('Printer not working');
    expect(matchedKeyword(options[1], terms)).toBeNull();
    expect(matchedKeyword(options[0], searchTerms('issue'))).toBeNull();
    expect(matchedKeyword(options[0], [])).toBeNull();
  });
});

describe('marking the matched letters', () => {
  it('marks each word once', () => {
    expect(matchSpans('Printer not working', ['printer', 'working'])).toEqual([[0, 7], [12, 19]]);
  });

  it('marks every time a word appears', () => {
    expect(matchSpans('paper jam paper', ['paper'])).toEqual([[0, 5], [10, 15]]);
  });

  it('merges words that overlap', () => {
    expect(matchSpans('printer', ['print', 'rinter'])).toEqual([[0, 7]]);
  });

  it('marks nothing when nothing matches', () => {
    expect(matchSpans('printer', ['scanner'])).toEqual([]);
    expect(matchSpans('printer', [])).toEqual([]);
  });
});
