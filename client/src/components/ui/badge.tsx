import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"


const badgeVariants = cva(
  // Base Properties: Crisp flex alignment, typography, smooth transitions, and advanced focus rings.
  // Not uppercase — every consumer already passes properly-capitalized labels ("Due", "In Progress",
  // "No stores selected"), and forcing multi-word phrases into tracked-out caps read as shouty/
  // robotic rather than a status pill, especially once a label runs past one short word.
  "inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 sm:py-1 t-meta sm:t-meta font-display font-bold tracking-wide w-fit whitespace-nowrap shrink-0 gap-1.5 transition-all duration-300 overflow-hidden bg-transparent [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        // Matches your Navy Primary brand color
        default:
          "border-primary-500/40 text-primary-700 dark:text-primary-300 hover:bg-primary-500/10 focus-visible:ring-primary-500/50",
        
        // Subtle surface blending for secondary information
        secondary:
          "border-border text-text-secondary hover:bg-surface-hover hover:border-border-hover focus-visible:ring-border/50",
        
        // Uses your --color-danger variable (Error/Delete)
        destructive:
          "border-danger/40 text-danger hover:bg-danger/10 focus-visible:ring-danger/50",
        
        // Uses your --color-success variable (Complete/Positive)
        success:
          "border-success/40 text-success hover:bg-success/10 focus-visible:ring-success/50",
        
        // Uses your --color-warning variable (Alerts/Pending)
        warning:
          "border-warning/40 text-warning hover:bg-warning/10 focus-visible:ring-warning/50",
        
        // Uses your --color-info variable (Highlights/Notes)
        info:
          "border-info/40 text-info hover:bg-info/10 focus-visible:ring-info/50",
        
        // Extremely muted for background metadata (e.g., timestamps)
        neutral:
          "border-border/60 text-text-muted hover:text-text hover:border-border focus-visible:ring-text-muted/50",
        
        // High-contrast, pure structural outline
        outline:
          "border-text/20 text-text hover:border-text/40 hover:bg-text/5 focus-visible:ring-text/50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

// badgeVariants is exported so other components can reuse the same variant classes (shadcn/ui
// convention); only affects Fast Refresh granularity, not runtime correctness.
// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants }