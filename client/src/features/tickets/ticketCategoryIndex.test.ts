import { describe, expect, it } from 'vitest';
import { buildCategoryIndex, departmentIdOf, hasActiveSubcategory } from './ticketCategoryIndex';
import type { Category, Subcategory } from '../../api/categories';

const sub = (id: string, name: string, isActive = true) => ({ id, name, isActive }) as Subcategory;

const category = (id: string, name: string, isActive: boolean, subcategories: Subcategory[]) =>
  ({ id, name, isActive, departmentId: { id: `d-${id}`, name: `Team ${id}` }, subcategories }) as Category;

const categories = [
  category('b', 'Network', true, [sub('b1', 'Wi-Fi down'), sub('b2', 'Old line', false)]),
  category('a', 'Accounts', true, [sub('a1', 'Wrong bill')]),
  category('c', 'Retired', false, [sub('c1', 'Never offered')]),
];

describe('category index', () => {
  const index = buildCategoryIndex(categories);

  it('looks a category up by id without scanning', () => {
    expect(index.byId.get('a')?.name).toBe('Accounts');
    expect(index.byId.get('missing')).toBeUndefined();
  });

  it('offers only what someone can actually pick', () => {
    expect(index.problems.map((p) => p.subcategory.name)).toEqual(['Wrong bill', 'Wi-Fi down']);
    expect(index.problemById.get('b2')).toBeUndefined();
    expect(index.problemById.get('c1')).toBeUndefined();
  });

  it('keeps a retired category reachable for tickets already on it', () => {
    expect(index.byId.get('c')?.name).toBe('Retired');
  });

  it('survives no data at all', () => {
    expect(buildCategoryIndex(undefined).problems).toEqual([]);
    expect(buildCategoryIndex([]).byId.size).toBe(0);
  });

  it('reads the department whichever shape it arrives in', () => {
    expect(departmentIdOf({ departmentId: { id: 'd1', name: 'IT' } } as Category)).toBe('d1');
    expect(departmentIdOf({ departmentId: 'd2' } as unknown as Category)).toBe('d2');
  });

  it('knows when a subcategory must be chosen', () => {
    expect(hasActiveSubcategory(index.byId.get('b'))).toBe(true);
    expect(hasActiveSubcategory(undefined)).toBe(false);
    expect(hasActiveSubcategory(category('d', 'Plain', true, [sub('d1', 'Off', false)]))).toBe(false);
  });
});
