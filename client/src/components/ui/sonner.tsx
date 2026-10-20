import { useEffect, type CSSProperties, type ReactNode } from "react"
import { Toaster as Sonner, toast, type ToasterProps } from "sonner"
import { AlertTriangle, Check, Info, Loader2, X, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useTheme } from "@/context/ThemeContext"
import { useIsMobile } from "@/lib/useMediaQuery"

const PHONE_OFFSET = {
  bottom: "calc(10.5rem + env(safe-area-inset-bottom))",
  left: "0.75rem",
  right: "0.75rem",
}

const DESKTOP_OFFSET = { top: "5.75rem", right: "1.5rem" }

const ToastIcon = ({ icon: Icon, tone, spin = false }: { icon: LucideIcon; tone: string; spin?: boolean }): ReactNode => (
  <span className={cn("flex size-8 items-center justify-center rounded-lg bg-linear-to-br text-white", tone)}>
    <Icon className={cn("size-4", spin && "animate-spin motion-reduce:animate-none")} strokeWidth={2.75} aria-hidden="true" />
  </span>
)

const ICONS: ToasterProps["icons"] = {
  success: <ToastIcon icon={Check} tone="from-success to-success-strong" />,
  error: <ToastIcon icon={X} tone="from-danger to-danger/70" />,
  warning: <ToastIcon icon={AlertTriangle} tone="from-warning to-warning/70" />,
  info: <ToastIcon icon={Info} tone="from-primary-500 to-primary-700" />,
  loading: <ToastIcon icon={Loader2} tone="from-primary-500 to-primary-700" spin />,
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()
  const isMobile = useIsMobile()

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("[data-sonner-toast]")) {
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
      duration={2800}
      icons={ICONS}
      toastOptions={{
        classNames: {
          toast: "!items-center !gap-3 !rounded-2xl !border !border-border/60 !bg-surface !p-3.5 !shadow-none",
          icon: "!m-0 !size-8 !shrink-0",
          content: "!gap-0.5",
          title: "t-card font-display !font-bold !text-text",
          description: "t-meta font-display !text-text-muted",
          closeButton: "!bg-surface !border-border !text-text-light hover:!text-text hover:!bg-surface-hover",
          actionButton: "!min-h-11 !rounded-lg !bg-primary-600 !px-4 !text-sm !font-semibold !text-white hover:!bg-primary-700 sm:!min-h-9",
          cancelButton: "!min-h-11 !rounded-lg !bg-surface-hover !px-4 !text-sm !font-semibold !text-text-secondary sm:!min-h-9",
        },
      }}
      style={
        {
          "--width": isMobile ? "100%" : "380px",
          "--normal-bg": "var(--color-surface)",
          "--normal-text": "var(--color-text)",
          "--normal-border": "var(--color-border)",
        } as CSSProperties
      }
      {...props}
      position={isMobile ? "bottom-center" : "top-right"}
      offset={isMobile ? PHONE_OFFSET : DESKTOP_OFFSET}
      mobileOffset={PHONE_OFFSET}
    />
  )
}

export { Toaster }
