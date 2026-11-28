import { createContext } from 'react';

/** The question's position in the checklist (1-based), so a card can show "3" where the type icon was. */
export const ItemNumberContext = createContext<number | undefined>(undefined);
