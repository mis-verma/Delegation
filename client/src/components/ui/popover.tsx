import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

function Popover({
  modal = false,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  // See Select/DropdownMenu's comment: defaulting to non-modal avoids the classic "nested inside
  // a Dialog" pointer-events lock conflict between Radix's modal primitives.
  return <PopoverPrimitive.Root data-slot="popover" modal={modal} {...props} />
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  container,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & { container?: HTMLElement | null }) {
  return (
    <PopoverPrimitive.Portal container={container ?? undefined}>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          // Same z-[80]-above-Dialog convention as dropdown-menu.tsx/select.tsx — this is the
          // primitive Combobox portals its own search-result list through, so it needs to escape
          // a Modal's own overflow clipping and render above it, not get cut off by it.
          "z-[80] w-(--radix-popover-trigger-width) min-w-[12rem] origin-(--radix-popover-content-transform-origin) outline-none",
          // No shadow — same border-only elevation Modal (the app's biggest overlay) already
          // uses; separation comes from the border and the content behind it, not a drop shadow.
          "bg-surface rounded-2xl border border-border p-3",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverAnchor, PopoverTrigger, PopoverContent }