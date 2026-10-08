import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center font-sans", className)}
      {...props}
    />
  )
}

function PaginationContent({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex flex-row items-center gap-1 sm:gap-1.5", className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
  size?: "default" | "icon"
} & React.ComponentProps<"a">

function PaginationLink({
  className,
  isActive,
  size = "icon",
  ...props
}: PaginationLinkProps) {
  return (
    <a
      aria-current={isActive ? "page" : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-xl text-[0.8125rem] sm:text-sm font-bold tracking-wide transition-all duration-200 cursor-pointer active:scale-95",
        "focus-visible:outline-none focus-visible:ring-4",
        size === "icon" 
          ? "h-10 sm:h-11 min-w-[2.5rem] sm:min-w-[2.75rem] px-2" 
          : "h-10 sm:h-11 px-3 sm:px-4",
        isActive
          ? "bg-primary-600 text-white shadow-md shadow-primary-600/30 hover:bg-primary-700 focus-visible:ring-primary-100/50"
          : "text-text-secondary hover:bg-surface-hover hover:text-text focus-visible:ring-border",
        className,
      )}
      {...props}
    />
  )
}

function PaginationPrevious({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      className={className}
      {...props}
    >
      <ChevronLeftIcon className="size-4 sm:size-5" strokeWidth={2.5} />
      <span className="hidden sm:inline">Previous</span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      className={className}
      {...props}
    >
      <span className="hidden sm:inline">Next</span>
      <ChevronRightIcon className="size-4 sm:size-5" strokeWidth={2.5} />
    </PaginationLink>
  )
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "flex h-10 sm:h-11 min-w-[2.5rem] sm:min-w-[2.75rem] items-center justify-center text-text-light",
        className
      )}
      {...props}
    >
      <MoreHorizontalIcon className="size-5" strokeWidth={2.5} />
      <span className="sr-only">More pages</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
}