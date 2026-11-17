import type { RowDataPacket } from "mysql2"
import { pool } from "../config/db.js"

const LOCK_PREFIX = "karya:job:"
const NO_WAIT_SECONDS = 0

interface LockRow extends RowDataPacket {
    locked: number | string | null
}

const lockName = (job: string) => `${LOCK_PREFIX}${job}`.slice(0, 64)

export const withJobLock = async <T>(job: string, run: () => Promise<T>): Promise<T | null> => {
    const name = lockName(job)
    let connection
    try {
        connection = await pool.getConnection()
        const [rows] = await connection.query<LockRow[]>("SELECT GET_LOCK(?, ?) AS locked", [name, NO_WAIT_SECONDS])
        if (Number(rows[0]?.locked) !== 1) {
            connection.release()
            return null
        }
    } catch (err) {
        connection?.release()
        console.error(`Job ${job} could not take its lock, running without it`, err)
        return run()
    }
    try {
        return await run()
    } finally {
        try {
            await connection.query("SELECT RELEASE_LOCK(?)", [name])
        } catch (err) {
            console.error(`Job ${job} could not release its lock`, err)
        }
        connection.release()
    }
}
