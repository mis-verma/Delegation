import { useEffect, type CSSProperties } from "react"
import { Toaster as Sonner, toast, type ToasterProps } from "sonner"

import { useTheme } from "@/context/ThemeContext"
import { useIsMobile } from "@/lib/useMediaQuery"

const PHONE_OFFSET = {
  bottom: "calc(10.5rem + env(safe-area-inset-bottom))",
  left: "0.75rem",
  right: "0.75rem",
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()
  const isMobile = useIsMobile()

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("[data-sonner-toast]")) {
        // A tap elsewhere clears the plain notices, but never a toast that carries an action (Undo): the
        // decision behind it is still waiting out its 10 seconds, and losing the button loses the chance
        // to take it back.
        for (const t of toast.getToasts()) {
          if (!("action" in t) || !t.action) toast.dismiss(t.id)
        }
      }
    }
    document.addEventListener("click", handleClickOutside)
    return () => document.removeEventListener("click", handleClickOutside)
  }, [])

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      closeButton={!isMobile}
      visibleToasts={isMobile ? 1 : 3}
      duration={4000}
      toastOptions={{
        classNames: {
          // No shadow — border-only, same convention Modal/Popover/DropdownMenu/Select all use
          // now. The border AND a heavy shadow were doing the same separation job twice.
          toast: "rounded-xl border",
          title: "font-display font-semibold",
          description: "!text-text-muted",
          closeButton: "!bg-surface !border-border !text-text-light hover:!text-text hover:!bg-surface-hover",
          // A thumb-sized Undo: the default action button is about 24px tall.
          actionButton: "!min-h-11 !px-4 !text-sm !font-semibold !rounded-lg",
          // One theme-colored left accent per toast kind — the "beautify with a single accent"
          // language the stat cards and quick-filter tiles already use, instead of every toast
          // being visually identical regardless of what it's reporting.
          success: "border-l-2 border-l-success",
          error: "border-l-2 border-l-danger",
          warning: "border-l-2 border-l-warning",
          info: "border-l-2 border-l-primary-500",
        },
      }}
      style={
        {
          "--normal-bg": "var(--color-surface)",
          "--normal-text": "var(--color-text)",
          "--normal-border": "var(--color-border)",
          "--success-bg": "var(--color-surface)",
          "--success-text": "var(--color-success)",
          "--success-border": "var(--color-success)",
          "--error-bg": "var(--color-surface)",
          "--error-text": "var(--color-danger)",
          "--error-border": "var(--color-danger)",
        } as CSSProperties
      }
      {...props}
      // Under the thumb on a phone, top-right on a larger screen. The phone offset clears the bottom
      // bar AND the Fab above it (Fab sits at 6.25rem + safe area, about 3.5rem tall). Sonner only
      // applies `mobileOffset` up to 600px, so `offset` carries the same values on 601 to 767px,
      // where useIsMobile still says phone.
      position={isMobile ? "bottom-center" : "top-right"}
      offset={isMobile ? PHONE_OFFSET : undefined}
      mobileOffset={PHONE_OFFSET}
    />
  )
}

export { Toaster }
