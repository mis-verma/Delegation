import { createContext, useContext } from 'react';
import type { OrgMovePatch } from './orgStructureDisplay';

export interface MoveTarget {
  id: string;
  name: string;
  storeId: string | null;
  storeName: string | null;
}

export interface OrgMoveApi {
  targets: MoveTarget[];
  moveUser: (userId: string, patch: OrgMovePatch) => void;
  nameOf: (userId: string) => string | undefined;
}

export const OrgMoveContext = createContext<OrgMoveApi | null>(null);

export const useOrgMove = () => useContext(OrgMoveContext);
