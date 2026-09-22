import { useEffect, type CSSProperties } from "react"
import { Toaster as Sonner, toast, type ToasterProps } from "sonner"

import { useTheme } from "@/context/ThemeContext"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("[data-sonner-toast]")) {
        toast.dismiss()
      }
    }
    document.addEventListener("click", handleClickOutside)
    return () => document.removeEventListener("click", handleClickOutside)
  }, [])

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      closeButton
      toastOptions={{
        classNames: {
          // No shadow — border-only, same convention Modal/Popover/DropdownMenu/Select all use
          // now. The border AND a heavy shadow were doing the same separation job twice.
          toast: "rounded-xl border",
          title: "font-display font-semibold",
          description: "!text-text-muted",
          closeButton: "!bg-surface !border-border !text-text-light hover:!text-text hover:!bg-surface-hover",
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
    />
  )
}

export { Toaster }
