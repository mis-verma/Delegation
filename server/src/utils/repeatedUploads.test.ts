import { describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import { splitRepeatedUploads } from "./repeatedUploads.js"

describe("splitRepeatedUploads", () => {
    it("keeps new files and recognises ones that were just saved", () => {
        const unlink = vi.spyOn(fs, "unlink").mockImplementation(((_path: unknown, cb: () => void) => cb()) as never)
        const files = [
            { originalname: "a.jpg", size: 100, path: "/tmp/a" },
            { originalname: "b.jpg", size: 200, path: "/tmp/b" },
        ]
        const saved = [{ originalFilename: "a.jpg", sizeBytes: 100, id: "row-a" }]
        const { fresh, already } = splitRepeatedUploads(files, saved)
        expect(fresh.map((f) => f.originalname)).toEqual(["b.jpg"])
        expect(already.map((r) => r.id)).toEqual(["row-a"])
        expect(unlink).toHaveBeenCalledTimes(1)
        unlink.mockRestore()
    })

    it("treats a different size as a different photo", () => {
        const unlink = vi.spyOn(fs, "unlink").mockImplementation(((_path: unknown, cb: () => void) => cb()) as never)
        const { fresh, already } = splitRepeatedUploads([{ originalname: "a.jpg", size: 101, path: "/tmp/a" }], [{ originalFilename: "a.jpg", sizeBytes: 100 }])
        expect(fresh).toHaveLength(1)
        expect(already).toHaveLength(0)
        expect(unlink).not.toHaveBeenCalled()
        unlink.mockRestore()
    })
})
