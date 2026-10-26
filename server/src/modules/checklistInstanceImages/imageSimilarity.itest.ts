import { beforeAll, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { assertThrowawayDatabase } from "../../test/integrationHarness.js"
import { hammingHex } from "../../utils/imageHash.js"
import { hashDistanceSql } from "./imageSimilarity.js"

const distanceInSql = async (a: string, b: string): Promise<number> => {
    const [rows] = await db.execute(sql`SELECT ${hashDistanceSql(sql`${a}`, b)} AS distance`)
    return Number((rows as unknown as { distance: string | number }[])[0]!.distance)
}

beforeAll(() => {
    assertThrowawayDatabase()
})

describe("photo distance", () => {
    const samples: [string, string][] = [
        ["0000000000000000", "0000000000000000"],
        ["0000000000000000", "ffffffffffffffff"],
        ["f0f0f0f0a5a5a5a5", "f0f0f0f0a5a5a5a4"],
        ["f0f0f0f0a5a5a5a5", "f0f0f0f1a5a5a5a7"],
        ["8000000000000001", "0000000000000000"],
        ["123456789abcdef0", "0fedcba987654321"],
    ]

    it("counts the same differing bits in SQL as in code", async () => {
        for (const [a, b] of samples) {
            expect(await distanceInSql(a, b)).toBe(hammingHex(a, b))
        }
    })

    it("treats a couple of flipped bits as close and unrelated photos as far", async () => {
        expect(await distanceInSql("f0f0f0f0a5a5a5a5", "f0f0f0f1a5a5a5a7")).toBeLessThanOrEqual(4)
        expect(await distanceInSql("123456789abcdef0", "0fedcba987654321")).toBeGreaterThan(4)
    })
})
