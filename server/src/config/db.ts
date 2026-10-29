import os from 'node:os'
import mysql from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import { env } from './env.js'
import * as schema from '../db/schema/index.js'
import * as relations from '../db/schema/relations.js'

const pool = mysql.createPool({
    uri: env.DATABASE_URL,
    connectionLimit: env.DB_CONNECTION_LIMIT,
    connectTimeout: 10_000,
    queueLimit: 200,
    enableKeepAlive: true,
    dateStrings: false,
    ...(env.DB_TIMEZONE ? { timezone: env.DB_TIMEZONE } : {}),
});

export const db = drizzle(pool, { schema: { ...schema, ...relations }, mode: 'default' });

export const connectDB = async () => {
    const connection = await pool.getConnection();
    connection.release();

    const connectedName = (() => { try { return decodeURIComponent(new URL(env.DATABASE_URL).pathname.replace(/^\//, '')) } catch { return env.DB_NAME } })()
    console.log(`MySQL connected : ${connectedName}`)
    await reportPoolHeadroom()
}

const reportPoolHeadroom = async () => {
    try {
        const [rows] = await pool.query("SHOW VARIABLES LIKE 'max_connections'")
        const allowed = Number((rows as { Value?: string }[])[0]?.Value)
        if (!Number.isFinite(allowed) || allowed <= 0) return
        const workers = env.CLUSTER_WORKERS ?? (env.NODE_ENV === 'production' ? os.cpus().length : 1)
        const total = workers * env.DB_CONNECTION_LIMIT
        console.log(`DB pool: ${env.DB_CONNECTION_LIMIT} per worker x ${workers} workers = ${total} of ${allowed} allowed by MySQL`)
        if (total > allowed * 0.8) console.warn(`DB pool is too large for MySQL (${total} of ${allowed}). Lower DB_CONNECTION_LIMIT or raise max_connections.`)
    } catch {
    }
}

export const disconnectDB = async () => {
    await pool.end();
}

export const pingDB = async (): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string }> => {
    const start = Date.now();
    try {
        const connection = await pool.getConnection();
        connection.release();
        return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
