import { describe, expect, it } from "vitest"
import { variantFormat } from "./imageVariants.js"

describe("variantFormat", () => {
    it("sends WebP to browsers that accept it", () => {
        expect(variantFormat("image/avif,image/webp,image/apng,*/*;q=0.8")).toBe("webp")
    })
    it("falls back to JPEG otherwise", () => {
        expect(variantFormat("image/jpeg,*/*")).toBe("jpeg")
        expect(variantFormat(undefined)).toBe("jpeg")
    })
})
