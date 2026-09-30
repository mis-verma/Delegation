import { useAuth } from '../../../context/AuthContext';

/**
 * Once someone finishes a step it stays finished: only an admin can reopen it. A reviewer who sends
 * a run back (Reject) resets every step on the server, so nobody else needs an undo of their own
 * work, and a stray tap can't quietly un-complete a step.
 *
 * The server enforces the same rule (setItemDone / audit submission setDone); this only keeps the
 * controls from showing to people it would refuse. PC is left out on purpose, same as the
 * approved-run lock (assertInstanceEditable).
 */
export const useCanReopen = (): boolean => useAuth().user?.role === 'ADMIN';
