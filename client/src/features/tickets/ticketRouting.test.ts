import { describe, expect, it } from 'vitest';
import { buildProblemMatcher, tokenize } from './ticketRouting';
import type { ProblemEntry } from './ticketCategoryIndex';

const entry = (category: string, subcategory: string, index: number): ProblemEntry => ({
  category: { id: `c${index}`, name: category } as ProblemEntry['category'],
  subcategory: { id: `s${index}`, name: subcategory } as ProblemEntry['subcategory'],
});

const entries: ProblemEntry[] = [
  ['ERP & App Issue', 'Acme billing / POS down – counter cannot bill'],
  ['ERP & App Issue', 'Login, user ID, role & rights'],
  ['IT Hardware & Devices', 'Printer / tag printer not working'],
  ['Network & Telephony', 'Internet / Wi-Fi / LAN down or slow'],
  ['CCTV & Biometric', 'CCTV offline / not recording / freeze'],
  ['Facilities & Maintenance', 'Plumbing – leakage, drain, washroom, RO'],
  ['HR & Employee Services', 'Payslip / salary / incentive query'],
].map(([category, subcategory], index) => entry(category!, subcategory!, index));

const matcher = buildProblemMatcher(entries);
const nameFor = (text: string) => matcher.match(text)?.entry.subcategory.name ?? null;

describe('problem matcher', () => {
  it('drops short words and filler so they cannot decide a match', () => {
    expect(tokenize('The printer is NOT working for us')).toEqual(['printer']);
    expect(tokenize('!!! ???')).toEqual([]);
  });

  it('finds the problem people actually describe', () => {
    expect(nameFor('wifi is very slow in the store')).toBe('Internet / Wi-Fi / LAN down or slow');
    expect(nameFor('printer not printing tags')).toBe('Printer / tag printer not working');
    expect(nameFor('toilet water leakage')).toBe('Plumbing – leakage, drain, washroom, RO');
    expect(nameFor('salary slip query')).toBe('Payslip / salary / incentive query');
    expect(nameFor('cctv camera freeze')).toBe('CCTV offline / not recording / freeze');
  });

  it('stays silent rather than guessing', () => {
    expect(nameFor('')).toBeNull();
    expect(nameFor('the weather is nice today')).toBeNull();
    expect(nameFor('hi')).toBeNull();
  });

  it('handles an empty catalogue', () => {
    expect(buildProblemMatcher([]).match('printer not working')).toBeNull();
  });
});
