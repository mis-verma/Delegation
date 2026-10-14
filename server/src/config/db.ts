import mysql from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import { env } from './env.js'
import * as schema from '../db/schema/index.js'
import * as relations from '../db/schema/relations.js'

// A shared connection pool (not a single connection) — mysql2's pool handles
// reconnects and concurrent queries across requests/cluster workers the same
// way Mongoose's connection pool did for MongoDB. mysql2 pools are lazy (no actual
// TCP connection is opened until the first query/`getConnection()` call), so it's
// safe to create the pool — and the Drizzle client wrapping it — at module load
// time; `connectDB()` below just does an explicit "fail fast if unreachable" check
// before the server starts accepting requests.
const pool = mysql.createPool({
    uri: env.DATABASE_URL,
    connectionLimit: env.DB_CONNECTION_LIMIT,
    // Fail a stuck connect in 10s instead of hanging, and cap the wait line: past 200 queued
    // queries a request fails fast (the error handler returns 5xx) instead of piling up forever.
    connectTimeout: 10_000,
    queueLimit: 200,
    enableKeepAlive: true,
    // Return JS Date objects (not strings) for DATETIME/TIMESTAMP columns, matching
    // what every service already expects (Mongoose always gave back real Dates).
    dateStrings: false,
    // Only when configured (see DB_TIMEZONE in env.ts); unset keeps the driver's default.
    ...(env.DB_TIMEZONE ? { timezone: env.DB_TIMEZONE } : {}),
});

// The Drizzle client used everywhere else in the app (`import { db } from '../config/db.js'`).
// Exported as `db` (not `mongoose`/a model) — every service module now imports this
// instead of a Mongoose model. Declared as a plain `const` (type fully inferred) rather
// than a pre-typed `let` assigned later — an explicit `ReturnType<typeof drizzle<...>>`
// annotation here runs into a TS2719 "two different types with this name" quirk against
// this drizzle-orm version when the schema+relations modules are merged at the call site.
export const db = drizzle(pool, { schema: { ...schema, ...relations }, mode: 'default' });

export const connectDB = async () => {
    // Fail fast on startup if the DB is unreachable, same as Mongoose's connect() did.
    const connection = await pool.getConnection();
    connection.release();

    console.log(`MySQL connected : ${env.DB_NAME}`)
}

export const disconnectDB = async () => {
    await pool.end();
}

// Cheap, on-demand connectivity check for the readiness endpoint (app.ts's /health/ready) — reuses
// the exact same "borrow a connection from the pool, release it" check connectDB() does at boot,
// rather than opening a dedicated connection just to probe liveness.
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
