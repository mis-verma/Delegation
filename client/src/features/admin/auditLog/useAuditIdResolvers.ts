import { useMemo } from 'react';
import { useUsersQuery } from '../hook';
import { useDepartmentsQuery, useStoresQuery } from '../../tickets/hook';
import { useCategoriesQuery } from '../../settings/hook';
import { useTagsQuery } from '../../tags/hook';
import type { AuditIdResolvers } from './auditLogDisplay';

const displayName = (u: { firstName: string; lastName: string | null }) =>
  u.lastName ? `${u.firstName} ${u.lastName}` : u.firstName;

/**
 * Builds the id -> name lookup tables diffAuditLog needs to turn raw foreign keys (assigneeId,
 * tagIds, departmentId, ...) into something a QC reviewer can actually read, instead of a bare
 * nanoid. `enabled` gates every underlying query so a non-ADMIN/PC viewer — for whom
 * ActivityTimeline always mounts but renders nothing — never fires these org-wide lookups.
 *
 * Each query here is also already used elsewhere in the app (forms, filters, org structure), so
 * this mostly reads from react-query's existing cache rather than adding new network calls.
 */
export const useAuditIdResolvers = (enabled: boolean): AuditIdResolvers => {
  const { data: users } = useUsersQuery(enabled);
  const { data: tags } = useTagsQuery(enabled);
  const { data: departments } = useDepartmentsQuery(enabled);
  const { data: categories } = useCategoriesQuery(enabled);
  const { data: stores } = useStoresQuery(enabled);

  return useMemo(
    () => ({
      users: new Map((users ?? []).map((u) => [u.id, displayName(u)])),
      tags: new Map((tags ?? []).map((t) => [t.id, t.name])),
      departments: new Map((departments ?? []).map((d) => [d.id, d.name])),
      categories: new Map((categories ?? []).map((c) => [c.id, c.name])),
      stores: new Map((stores ?? []).map((s) => [s.id, s.name])),
    }),
    [users, tags, departments, categories, stores],
  );
};
