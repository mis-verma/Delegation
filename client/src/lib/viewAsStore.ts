type Listener = (id: string | null) => void;

const KEY = 'tm-view-as';

const read = (): string | null => {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
};

let currentId: string | null = read();
const listeners = new Set<Listener>();

export const viewAsStore = {
  get: () => currentId,

  set: (id: string | null) => {
    currentId = id;
    try {
      if (id) sessionStorage.setItem(KEY, id);
      else sessionStorage.removeItem(KEY);
    } catch {
    }
    listeners.forEach((l) => l(id));
  },

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
