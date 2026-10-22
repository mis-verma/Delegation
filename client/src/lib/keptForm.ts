const PREFIX = 'tm-kept:';

export const readKept = <T extends object>(key: string): T | null => {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as T) : null;
  } catch {
    return null;
  }
};

export const writeKept = (key: string, value: object) => {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    void 0;
  }
};

export const clearKept = (key: string) => {
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    void 0;
  }
};
