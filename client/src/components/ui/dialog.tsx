import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        // z-[70] — above every full-screen overlay in the app (drawers/sheets top out at z-[60]),
        // since a modal dialog must always be able to stack on top of a drawer it was opened
        // from. Dropdown/Select content goes one step higher still (z-[80]) — those are popovers
        // spawned from *inside* a dialog (e.g. an assignee picker in a form modal) rather than a
        // competing full-screen surface, and being portalled to document.body as siblings of the
        // dialog, they need a higher z-index of their own to render on top of it, not beneath it.
        "fixed inset-0 z-[70] bg-black/50",
        // 150ms/100ms, not 200ms/150ms — every dialog in the app already carries a real, un-
        // removable ~90-100ms of framework overhead before this animation even starts (Radix's own
        // Presence machinery probes computed style to time exit/enter correctly), so the visible
        // entrance/exit is the one part of the total "click to settled" time actually left to trim.
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:duration-150 data-[state=closed]:duration-100",
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  overlayClassName,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /** Overrides the backdrop's own classes (default `bg-black/50`) — for a dialog
   *  that's opened/closed constantly (e.g. an Options filter panel) rather than read, where the
   *  default dimming makes the rest of the page go dark every time. Optional and additive: every
   *  other dialog keeps the default backdrop untouched. */
  overlayClassName?: string
  /** React 19 lets a function component accept `ref` as a plain prop — forwarded straight to the
   *  underlying Radix content node so a caller (e.g. Modal's drag-to-reposition) can read its
   *  live bounding box, without needing a forwardRef wrapper this component never had. */
  ref?: React.Ref<HTMLDivElement>
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        ref={ref}
        data-slot="dialog-content"
        className={cn(
          // No shadow and no blurred backdrop: both repaint a large area on every animation frame, which is
          // what made dialogs stutter on low-end Android phones. A border and a plain dim separate it.
          "fixed z-[70] grid w-full gap-5 bg-surface text-text p-6 sm:p-7 border border-border outline-none max-h-[90vh] overflow-y-auto no-scrollbar",
          
          // Buttery smooth entry/exit physics — tightened alongside the overlay above.
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:duration-150 data-[state=closed]:duration-100 data-[state=open]:ease-[cubic-bezier(0.32,0.72,0,1)]",
          
          // Mobile: bottom sheet, pinned edge-to-edge
          "bottom-0 left-0 right-0 top-auto max-w-full translate-x-0 translate-y-0 rounded-t-[2rem] rounded-b-none pb-[max(1.5rem,env(safe-area-inset-bottom))]",
          "data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 data-[state=closed]:slide-out-to-bottom-full data-[state=open]:slide-in-from-bottom-full",
          
          // Desktop: floating centered card
          "sm:top-[50%] sm:left-[50%] sm:right-auto sm:bottom-auto sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-lg sm:rounded-3xl sm:pb-7",
          "sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:slide-out-to-bottom-4 sm:data-[state=open]:slide-in-from-bottom-4",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className={cn(
              // Matches SheetClose's accessible sizing/contrast: size-10 clears the 44px
              // touch-target guideline better than the old size-8, text-text-muted has real
              // contrast against the background (text-text-light read as barely-there), and
              // a visible ring-primary-500 focus ring replaces the old ring-surface-hover, which
              // was nearly the same color as the button's own hover background.
              "absolute top-4 right-4 flex items-center justify-center size-10 rounded-full text-text-muted z-10 cursor-pointer transition-all duration-200",
              "hover:text-text hover:bg-surface-hover",
              "outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40",
              "active:scale-90 disabled:pointer-events-none"
            )}
          >
            <XIcon size={18} strokeWidth={2.5} />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-3 sm:flex-row sm:justify-end mt-2",
        className,
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-xl font-bold text-text tracking-tight leading-tight", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm font-medium text-text-muted leading-relaxed", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}