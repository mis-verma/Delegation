import type { QueryClient } from '@tanstack/react-query';

const dig = (node: unknown, id: string): Record<string, unknown> | undefined => {
  if (node == null || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = dig(item, id);
      if (hit) return hit;
    }
    return undefined;
  }
  const obj = node as Record<string, unknown>;
  if (obj.id === id) return obj;
  if (Array.isArray(obj.data)) return dig(obj.data, id);
  if (Array.isArray(obj.pages)) return dig(obj.pages, id);
  return undefined;
};

export const findCachedEntity = (queryClient: QueryClient, keyPrefix: readonly unknown[], id: string): Record<string, unknown> | undefined => {
  for (const [, data] of queryClient.getQueriesData({ queryKey: keyPrefix })) {
    const hit = dig(data, id);
    if (hit) return hit;
  }
  return undefined;
};

export const fieldsBefore = (entity: Record<string, unknown> | undefined, payload: object): Record<string, unknown> | null => {
  if (!entity) return null;
  const keys = Object.keys(payload);
  if (keys.length === 0) return null;
  const before: Record<string, unknown> = {};
  for (const key of keys) {
    if (!(key in entity)) return null;
    before[key] = entity[key];
  }
  return before;
};

const FIELD_WORDS: Record<string, string> = {
  status: 'status',
  assigneeId: 'assignee',
  dueDate: 'due date',
  priority: 'priority',
  title: 'title',
  description: 'description',
  departmentId: 'department',
  storeId: 'store',
  categoryId: 'category',
  tatHours: 'deadline',
};

export const describeFields = (noun: string, payload: object): string => {
  const words = Object.keys(payload).map((key) => FIELD_WORDS[key]).filter((w): w is string => !!w);
  return words.length ? `${noun} ${words.slice(0, 2).join(' and ')}` : `${noun} change`;
};
