// A new card/section mounts after the click handler returns, so look it up on the next frame:
// scroll it into view, and for a question optionally put the cursor in its text so it can be
// reworded straight away.
export const revealAfterRender = (find: () => HTMLElement | null, focus: boolean, block: ScrollLogicalPosition = focus ? 'center' : 'start') =>
  requestAnimationFrame(() => {
    const el = find();
    if (!el) return;
    el.scrollIntoView({ block, behavior: 'smooth' });
    if (focus) el.focus({ preventScroll: true });
  });

/** The question text field of one question card, by the draft's key. */
export const questionFieldOf = (key: string) => document.getElementById(`item-label-${key}`);
