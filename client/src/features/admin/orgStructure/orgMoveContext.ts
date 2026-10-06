import { createContext, useContext } from 'react';
import type { OrgMovePatch } from './orgStructureDisplay';

export interface MoveTarget {
  id: string;
  name: string;
  storeId: string | null;
  storeName: string | null;
}

export interface OrgMoveApi {
  /** Active departments, sorted by name. */
  targets: MoveTarget[];
  moveUser: (userId: string, patch: OrgMovePatch) => void;
  /** A person's display name from their id, for "Reports to" lines. Undefined when they are not in the list. */
  nameOf: (userId: string) => string | undefined;
}

// Context rather than props: the "Move to..." menu sits on every person row, several memoized
// sections deep, and threading the department list through each of them would only add noise.
export const OrgMoveContext = createContext<OrgMoveApi | null>(null);

export const useOrgMove = () => useContext(OrgMoveContext);
