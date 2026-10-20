import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full border border-border/60 bg-surface px-2.5 t-meta font-display font-semibold text-text-secondary sm:h-7 before:size-2 before:shrink-0 before:rounded-full has-[>svg]:before:hidden [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40",
  {
    variants: {
      variant: {
        default: "before:bg-primary-600 [&>svg]:text-primary-600 dark:before:bg-primary-400 dark:[&>svg]:text-primary-300",
        secondary: "before:bg-text-muted [&>svg]:text-text-muted",
        destructive: "before:bg-danger [&>svg]:text-danger",
        success: "before:bg-success [&>svg]:text-success",
        warning: "before:bg-warning [&>svg]:text-warning",
        info: "before:bg-info [&>svg]:text-info",
        neutral: "before:bg-text-light [&>svg]:text-text-muted",
        outline: "before:bg-text-muted [&>svg]:text-text-muted",
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

// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants }
