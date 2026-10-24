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
- **Content priority over content parity.** Mobile doesn't need everything desktop shows, in the same order — surface the headline numbers first (a count, a rate, the next action) and make secondary blocks desktop-only (`hidden sm:block`/`sm:contents`) rather than tucking them behind "Show X" toggles. The Dashboard dropped every such toggle on purpose: a toggle on a glance screen is a tap nobody takes. Subtitles/descriptive sentences under card titles are desktop-only too.
- **One primary action per card/row; de-emphasize the rest.** A destructive or secondary action (Delete, etc.) sitting visually equal to the primary action reads as double-CTA clutter on a narrow screen — use `variant="ghost"` or muted styling for anything that isn't the one thing this row/card wants the user to do.
- **Collapse repeated stat/summary cards into compact tiles below `sm`.** A grid of big stat cards that's fine on desktop becomes a wall of boxes on a phone — below `sm`, render a 2x2 grid of small tiles (icon + label, big number + one secondary count), keep the full cards at `sm:` and up. Avoid horizontal-scroll chip strips for this: the last chip always gets sliced at the screen edge and reads as broken. Reference implementation: `KpiStrip.tsx`.
- **Wrap, don't truncate, when fixed-width chrome shares the row.** A title next to an icon/badge/button/chevron on a narrow screen needs `line-clamp-2 leading-snug` (or unbounded wrap), never `truncate` — `truncate` against that much competing width cuts titles down to a fragment. Bound row height with `line-clamp-2` if the row needs a consistent height, otherwise let it wrap freely.
- **Prefer plain CSS toggles (`sm:hidden` / `hidden sm:flex`) over JS-driven mobile detection.** Cheaper, no hydration flash, no extra state. Reach for `useIsMobile()` (`lib/useMediaQuery.ts`) only when a CSS toggle would desync a non-CSS system that also reads the same list — e.g. dnd-kit's `SortableContext` needing the exact same filtered array as what's rendered.

## 8. Typography Kit
- **Use the role classes, not one-off sizes.** `index.css` defines `t-title` (18px on a phone), `t-section` (17px, bold card and section titles), `t-card` (14px), `t-meta` (12px, dates, store, counts, chips) and `t-stat` (18px on a phone up to 24px, every stat or score number: stat tiles, stat cards, score figures; `t-figure` is the larger 20-32px size, kept for rare hero numbers only). The phone scale follows big shopping apps such as Amazon: 17px bold section titles, 14px item titles in a medium weight, 12px secondary text, 20px bold figures, 11px bottom-bar labels. Body text is `text-sm` (14px). Form inputs are `text-sm` too (14px, the same as the rest of the form text); index.html adds `maximum-scale=1` on iOS only, so iPhone Safari does not zoom into a field under 16px. Field labels are `t-meta font-display font-semibold text-text-secondary`.
- **They are fluid.** Each is `clamp(rem floor, rem + vw, rem ceiling)`: the floor is the phone size and follows the user's own text-size setting, and larger screens grow a little. Always rem, never px.
- **12px is the smallest size that carries meaning.** Never write `text-[0.6875rem]`, `text-[0.625rem]` or similar; use `t-meta`. These classes set size and line height only, so keep weight and colour on the element.
- **Phone weights (Amazon-app style, below `sm` only).** `index.css` gives each role a weight floor: `t-title`, `t-section`, `t-figure`, `t-stat` at least 700; `t-card` at least 600; `t-meta` at least 500; body text 500. It is a floor, never a ceiling: it reads the weight Tailwind's own `font-*` class set (`--tw-font-weight`), so `t-card font-bold` stays bold and a bare `t-card` is lifted to 600. Do not add per-element phone weight overrides; pick the right role class instead. The font stays Inter: Amazon's own typeface (Amazon Ember) is proprietary and cannot be used.
- **Small-phone scale.** `--type-scale` in `index.css` is 1 on a normal phone, 0.95 at 380px wide or less (iPhone SE and mini, 360px Androids) and 0.9 at 339px or less (320px phones). The `t-*` roles and Tailwind's `text-sm`, `text-lg`, `text-xl` and `text-2xl` and up multiply by it, so text and layout shrink together. `text-xs` (12px, the smallest size that stays readable) and `text-base` (16px, form inputs: smaller makes iOS zoom the page on tap) are deliberately not scaled. Do not add `text-[Npx]` sizes: they skip this scale.
- **One size per step, one face per job.** The steps are 12px (`text-xs`), 12 to 13px (`text-sm` and `t-meta`, the same size), 14 to 16px (`t-card`, topping out at the 16px body step), 16px (`text-base`), 18.4px (`text-lg` and `text-xl`, one step) and up. Do not add a size between two steps. Small text (`t-meta`, `text-xs`) is always Inter, even if it carries `font-display`; the display face (Plus Jakarta Sans) is for headings and big figures. `--text-2xl` must stay larger than `--text-xl`.
- **A page's name appears once.** On a phone the top bar already shows it (list in `lib/pageLabels.ts`), so `PageHeader` hides its own icon and title there and keeps only its actions. Add a new page to that list and both stay in step.
- **Fonts:** Calibri for everything from 640px up, and League Spartan (100 to 900) on phones, both set by the owner in place of Inter and Plus Jakarta Sans. Devices without Calibri (phones, Macs) get Carlito, its metric-compatible open twin, from Google Fonts, then Noto Sans Devanagari for Hindi text. Both have regular and bold only, so medium and semibold classes render at 400 or 700. Numbers use `tabular-nums`. Paragraphs use `text-wrap: pretty` and headings `text-wrap: balance`, set globally.

## 9. Spacing, Motion, Borders and Pages
- **Spacing scale.** Chips and icon-plus-label pairs `gap-1.5`; tight rows `gap-2`; normal stacks and card grids `gap-3`; sections inside a card `gap-4`; page blocks `gap-6`. Avoid `gap-2.5` and `gap-3.5` in new code; they are leftovers from before this rule.
- **Page top space.** A page's first block sits 1.5rem under the navbar: the layout gives 0.875rem and the page root adds `pt-2.5` (Tickets, Delegation, To-Do and Checklists do).
- **Headings.** A page or section title is `t-section font-display font-bold`; a card or list title is `t-card font-display font-bold` (or `font-semibold` inside dense lists). Not `text-lg`, `sm:text-xl` or bare `text-sm`.
- **Borders are solid.** No `border-dashed` on cards, boxes, empty states or avatar placeholders. The only dashed ones are file drop areas, the "add" chip and the Score chart empty bars. Hover is a border-colour change plus `active:scale-[0.985]`; no lift, no shadow.
- **Motion.** Page changes fade and rise 0.2s (`animate-in` on the keyed wrapper), links and nav items use `viewTransition` (0.16s cross-fade). No fade or dim when a filter changes on the same page. All of it is skipped under `prefers-reduced-motion`. Small hover and press effects run 150 to 200ms with `ease-out`.
- **Every list has three states.** A skeleton shaped like the real rows while loading, an `EmptyState` that says what to do next, and an `InlineError` with Retry. Success after the user's own action is a toast (with Undo where the action can be reversed), not a confirmation dialog; dialogs are for destructive or irreversible steps only.
