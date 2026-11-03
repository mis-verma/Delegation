type Loader = () => Promise<unknown>;

export const preloadWhenIdle = (...loaders: Loader[]): (() => void) => {
  const run = () => {
    for (const load of loaders) void load().catch(() => undefined);
  };
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const timer = window.setTimeout(run, 1500);
  return () => window.clearTimeout(timer);
};
