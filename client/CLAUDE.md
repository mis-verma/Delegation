# UI/UX & Tailwind CSS Expert Instructions

## 1. Role & Core Philosophy
- Act as a Senior UI/UX Developer specializing in Tailwind CSS.
- Prioritize pixel-perfect alignment, intuitive user flows, and robust responsive structures for all client/customer-facing components.

## 2. Strict Theme Adherence
- **Use the configured theme:** Always utilize the project's existing design tokens (colors, fonts, spacing) defined in `tailwind.config.js` or global CSS.
- **No arbitrary defaults:** Do not fall back to default Tailwind colors (e.g., `blue-500` or `gray-100`) if the project uses a custom color palette (e.g., `primary`, `secondary`, `surface`).

## 3. Layout & Alignment (The "No Mess" Rule)
- **Flex & Grid first:** Use Flexbox and CSS Grid for layouts. Rely on the `gap-*` utility for spacing between child elements.
- **Zero random margins:** Do not use `mt-*`, `mb-*`, `ml-*`, or `mr-*` to hack spacing between sibling elements. 
- **Micro-alignment:** Icons, labels, and buttons must be perfectly aligned. Always use `flex items-center` for horizontal pairings.
- **App Shell structure:** Ensure page layouts follow a consistent container structure (e.g., `w-full max-w-7xl mx-auto px-4 md:px-8`).

## 4. Mobile-First & Fluid Responsiveness
- **Start small:** Write default classes for mobile viewports first, then scale up using `md:`, `lg:`, and `xl:`.
- **No rigid dimensions:** Never hardcode fixed heights (`h-screen`, `h-96`) or widths that will break on odd screen sizes. Use percentages (`w-full`), flex proportions (`flex-1`), and max-widths (`max-w-md`).
- **Responsive stacking:** Content must gracefully collapse to vertical stacks (`flex-col`) on small screens and expand to horizontal or grid layouts on desktop.

## 5. Professional Polish & Interactions
- **Interactive states:** Every interactive element (buttons, links, inputs) MUST have `hover:`, `focus:`, and `disabled:` states.
- **Smooth transitions:** Add `transition-all duration-200 ease-in-out` to interactive elements to make the UI feel premium.
- **Accessibility (A11y):** Use semantic HTML tags (`<nav>`, `<main>`, `<section>`, `<article>`). Ensure focus rings are visible for keyboard navigation.

## 6. Established Patterns & Known Gotchas
Concrete lessons from this codebase, kept here so they don't get relearned the hard way twice.

- **A decorative accent doesn't scale down for free.** `StatCard.tsx`'s big background ring (`top-2 right-2 size-16 rounded-full border`) reads as a subtle flourish on a large card (`p-5`/`p-6`, Dashboard/Calendar). Copied onto a compact tile (`QuickFilterStats.tsx`, `p-3.5`/`p-4`) it overpowers the icon and reads as an ugly circle wrapped around it. Before reusing any large card's decorative treatment on a smaller component, check it at the smaller size first — don't assume it scales. A compact tile's icon box should just be a plain tinted `rounded-xl` box; lean on existing border/background-tint/accent-bar for "active" state instead of stacking another badge on top of the icon.
- **Dark mode needs opacity-tinted colors, not raw swatches.** `--color-primary-*` (and the other raw palette scales) do **not** get redefined under `:root[data-theme="dark"]` in `src/index.css` — only semantic tokens (`--color-surface`, `--color-text`, `--color-warning`, etc.) do. A literal `bg-primary-50`/`text-primary-900` pairing looks fine in light mode and renders as a stark, wrong-toned card in dark mode. Use opacity-based tints instead, e.g. `bg-primary-500/10 dark:bg-primary-500/15` with `text-primary-900 dark:text-primary-200` — opacity blends into whatever surface is under it in either theme.
- **Modal draggable convention:** pass `draggable` to the shared `Modal` component (`components/modal/Modal.tsx`, via `useDraggableDialog`) for any dialog worth repositioning over the page behind it. Keep a modal's `size`/`bodyClassName` fixed across its own internal view-states (e.g. chat view vs. review view) rather than switching them by state — that causes a visible resize-jump when the view changes.

## 7. Mobile Layout & Touch Ergonomics
Distilled for this stack (Tailwind/React web, not native) — apply these on every page that renders below `sm`/`md`.

- **Touch targets ≥ 44×44px, ≥ 8px apart.** Any tappable element on a touch viewport (buttons, icon actions, row checkboxes) needs real hit area, not just a visually small icon — pad the button, don't shrink the target to match the icon. Keep 8px+ gap between adjacent tappable elements so a finger can't miss and hit the wrong one.
- **Content priority over content parity.** Mobile doesn't need everything desktop shows, in the same order — surface the thing worth seeing at a glance first (a chart, the next action), and collapse or hide secondary blocks rather than stacking everything vertically in desktop's order. Reuse `MobileCollapsible` (`features/dashboard/MobileCollapsible.tsx`) for a "Show/Hide X" toggle instead of inventing a new expand pattern.
- **One primary action per card/row; de-emphasize the rest.** A destructive or secondary action (Delete, etc.) sitting visually equal to the primary action reads as double-CTA clutter on a narrow screen — use `variant="ghost"` or muted styling for anything that isn't the one thing this row/card wants the user to do.
- **Collapse repeated stat/summary rows into a compact chip strip below `sm`.** A grid of stat cards that's fine on desktop becomes a wall of boxes on a phone — below `sm`, render a horizontally-scrollable row of small pill chips instead (icon + number + label), keep the full grid at `sm:` and up. Reference implementation: `KpiStrip.tsx` / `QuickFilterStats.tsx`.
- **Wrap, don't truncate, when fixed-width chrome shares the row.** A title next to an icon/badge/button/chevron on a narrow screen needs `line-clamp-2 leading-snug` (or unbounded wrap), never `truncate` — `truncate` against that much competing width cuts titles down to a fragment. Bound row height with `line-clamp-2` if the row needs a consistent height, otherwise let it wrap freely.
- **Prefer plain CSS toggles (`sm:hidden` / `hidden sm:flex`) over JS-driven mobile detection.** Cheaper, no hydration flash, no extra state. Reach for `useIsMobile()` (`lib/useMediaQuery.ts`) only when a CSS toggle would desync a non-CSS system that also reads the same list — e.g. dnd-kit's `SortableContext` needing the exact same filtered array as what's rendered.
