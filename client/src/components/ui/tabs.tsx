import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "bg-surface-hover/70 text-text-muted ring-1 ring-inset ring-border/50 inline-flex flex-wrap w-fit items-center justify-center rounded-full p-1 gap-1",
        className,
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-surface data-[state=active]:text-text data-[state=active]:ring-1 data-[state=active]:ring-border/60 data-[state=active]:font-semibold data-[state=inactive]:hover:text-text focus-visible:ring-primary-500/50 focus-visible:outline-none focus-visible:ring-2 inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-display font-medium whitespace-nowrap transition-colors duration-200 ease-in-out disabled:pointer-events-none disabled:opacity-50 cursor-pointer active:scale-[0.97] text-text-muted",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }