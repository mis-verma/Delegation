import { AsyncLocalStorage } from "node:async_hooks"
import type { NextFunction, Request, Response } from "express"

const storage = new AsyncLocalStorage<{ source: string }>()

const KNOWN_SOURCES: Record<string, string> = { mcp: "MCP" }

export const sourceFromHeader = (value: unknown): string | null => {
    const raw = Array.isArray(value) ? value[0] : value
    if (typeof raw !== "string") return null
    return KNOWN_SOURCES[raw.trim().toLowerCase()] ?? null
}

export const captureRequestSource = (req: Request, _res: Response, next: NextFunction) => {
    const source = sourceFromHeader(req.headers["x-client-source"])
    if (!source) return next()
    storage.run({ source }, next)
}

export const currentRequestSource = (): string | null => storage.getStore()?.source ?? null
