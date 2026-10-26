import { afterAll, beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import type { Application } from "express"
import fs from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import { createId } from "@paralleldrive/cuid2"
import { bootApp } from "../test/integrationHarness.js"
import { signUploadPath } from "./signedUpload.js"
import { snapWidth } from "./imageVariants.js"

let app: Application
const folder = `itest-variants-${createId().slice(0, 8)}`
const folderPath = path.resolve("uploads", folder)
const name = `${createId().slice(0, 8)}.jpg`

const fetchImage = (url: string) =>
    request(app)
        .get(url)
        .buffer(true)
        .parse((res, cb) => {
            const chunks: Buffer[] = []
            res.on("data", (c: Buffer) => chunks.push(c))
            res.on("end", () => cb(null, Buffer.concat(chunks)))
        })

beforeAll(async () => {
    app = await bootApp()
    await fs.mkdir(folderPath, { recursive: true })
    await sharp({ create: { width: 2400, height: 1600, channels: 3, background: { r: 200, g: 120, b: 40 } } })
        .jpeg({ quality: 95 })
        .toFile(path.join(folderPath, name))
})

afterAll(async () => {
    await fs.rm(folderPath, { recursive: true, force: true })
})

describe("snapWidth", () => {
    it("snaps to the next allowed width and caps at the largest", () => {
        expect(snapWidth("100")).toBe(160)
        expect(snapWidth("320")).toBe(320)
        expect(snapWidth("500")).toBe(640)
        expect(snapWidth("99999")).toBe(1280)
    })

    it("rejects junk", () => {
        expect(snapWidth("abc")).toBeNull()
        expect(snapWidth("-5")).toBeNull()
        expect(snapWidth(undefined)).toBeNull()
    })
})

describe("uploads image variants", () => {
    it("serves a smaller copy when a width is asked for", async () => {
        const signed = signUploadPath(`/uploads/${folder}/${name}`)
        const original = await fetchImage(signed)
        const thumb = await fetchImage(`${signed}&w=320`)
        expect(original.status).toBe(200)
        expect(thumb.status).toBe(200)
        expect(thumb.headers["content-type"]).toContain("image/jpeg")
        const meta = await sharp(thumb.body as Buffer).metadata()
        expect(meta.width).toBe(320)
        expect((thumb.body as Buffer).length).toBeLessThan((original.body as Buffer).length / 4)
    })

    it("snaps a large width and never enlarges", async () => {
        const signed = signUploadPath(`/uploads/${folder}/${name}`)
        const big = await fetchImage(`${signed}&w=5000`)
        const meta = await sharp(big.body as Buffer).metadata()
        expect(meta.width).toBe(1280)
    })

    it("still needs a valid signature", async () => {
        const res = await fetchImage(`/uploads/${folder}/${name}?w=320`)
        expect(res.status).toBe(403)
    })

    it("falls back to the original for a missing file or a bad width", async () => {
        const missing = await fetchImage(`${signUploadPath(`/uploads/${folder}/nope.jpg`)}&w=320`)
        expect(missing.status).toBe(404)
        const signed = signUploadPath(`/uploads/${folder}/${name}`)
        const junk = await fetchImage(`${signed}&w=abc`)
        expect(junk.status).toBe(200)
        const meta = await sharp(junk.body as Buffer).metadata()
        expect(meta.width).toBe(2400)
    })

    it("does not serve the variants cache directly", async () => {
        const direct = await fetchImage(signUploadPath("/uploads/.variants/320/anything.jpg"))
        expect(direct.status).toBe(404)
    })
})
