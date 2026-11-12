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

interface PillBox {
  x: number
  y: number
  w: number
  h: number
}

function TabsList({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const [pill, setPill] = React.useState<PillBox | null>(null)
  const [animate, setAnimate] = React.useState(false)

  const measure = React.useCallback(() => {
    const list = listRef.current
    const active = list?.querySelector<HTMLElement>('[data-state="active"]')
    if (!list || !active) {
      setPill(null)
      return
    }
    setPill({ x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight })
  }, [])

  React.useLayoutEffect(() => {
    measure()
    const list = listRef.current
    if (!list) return undefined
    const mutations = new MutationObserver(measure)
    mutations.observe(list, { attributes: true, subtree: true, attributeFilter: ["data-state"] })
    const sizes = new ResizeObserver(measure)
    sizes.observe(list)
    Array.from(list.children).forEach((child) => sizes.observe(child))
    const children = new MutationObserver(() => Array.from(list.children).forEach((child) => sizes.observe(child)))
    children.observe(list, { childList: true })
    let alive = true
    void document.fonts?.ready.then(() => { if (alive) measure() })
    const frame = requestAnimationFrame(() => setAnimate(true))
    return () => {
      alive = false
      mutations.disconnect()
      children.disconnect()
      sizes.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [measure])

  return (
    <TabsPrimitive.List
      ref={listRef}
      data-slot="tabs-list"
      className={cn(
        "relative bg-surface-hover/70 text-text-muted ring-1 ring-inset ring-border/50 inline-flex flex-nowrap w-fit max-w-full overflow-x-auto no-scrollbar items-center rounded-full p-1 gap-1",
        className,
      )}
      {...props}
    >
      {pill && (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-0 top-0 rounded-full bg-surface ring-1 ring-border/60 motion-reduce:transition-none",
            animate && "transition-[transform,width,height] duration-200 ease-out",
          )}
          style={{ transform: `translate(${pill.x}px, ${pill.y}px)`, width: pill.w, height: pill.h }}
        />
      )}
      {children}
    </TabsPrimitive.List>
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
        "relative z-10 data-[state=active]:text-text data-[state=active]:font-semibold data-[state=inactive]:hover:text-text focus-visible:ring-primary-500/50 focus-visible:outline-none focus-visible:ring-2 inline-flex flex-[1_0_auto] items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-display font-medium whitespace-nowrap transition-colors duration-200 ease-in-out disabled:pointer-events-none disabled:opacity-50 cursor-pointer active:scale-[0.97] text-text-muted",
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
