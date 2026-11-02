import { toast } from 'sonner';

export interface UndoEntry {
  id: number;
  label: string;
  undo: () => Promise<unknown>;
  redo: () => Promise<unknown>;
}

type UndoInput = Omit<UndoEntry, 'id'>;

const LIMIT = 30;

let past: UndoEntry[] = [];
let future: UndoEntry[] = [];
let running = false;
let seq = 0;

export const pushUndo = (input: UndoInput): UndoEntry => {
  const entry: UndoEntry = { ...input, id: ++seq };
  past = [...past.slice(-(LIMIT - 1)), entry];
  future = [];
  return entry;
};

export const clearUndo = () => {
  past = [];
  future = [];
};

const failure = (err: unknown) => toast.error(err instanceof Error && err.message ? err.message : "Couldn't do that. Try again.");

const run = async (entry: UndoEntry, direction: 'undo' | 'redo') => {
  if (running) return;
  running = true;
  try {
    await (direction === 'undo' ? entry.undo() : entry.redo());
    if (direction === 'undo') {
      past = past.filter((e) => e.id !== entry.id);
      future = [...future, entry];
      toast.success(`Undone: ${entry.label}`);
    } else {
      future = future.filter((e) => e.id !== entry.id);
      past = [...past, entry];
      toast.success(`Redone: ${entry.label}`);
    }
  } catch (err) {
    failure(err);
  } finally {
    running = false;
  }
};

export const undoLast = async () => {
  const entry = past[past.length - 1];
  if (!entry) {
    toast('Nothing to undo');
    return;
  }
  await run(entry, 'undo');
};

export const redoLast = async () => {
  const entry = future[future.length - 1];
  if (!entry) {
    toast('Nothing to redo');
    return;
  }
  await run(entry, 'redo');
};

export const undoEntry = async (entry: UndoEntry) => {
  if (!past.some((e) => e.id === entry.id)) return;
  await run(entry, 'undo');
};
