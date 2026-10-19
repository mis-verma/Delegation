export const revealAfterRender = (find: () => HTMLElement | null, focus: boolean, block: ScrollLogicalPosition = focus ? 'center' : 'start') =>
  requestAnimationFrame(() => {
    const el = find();
    if (!el) return;
    el.scrollIntoView({ block, behavior: 'smooth' });
    if (focus) el.focus({ preventScroll: true });
  });

export const questionFieldOf = (key: string) => document.getElementById(`item-label-${key}`);
