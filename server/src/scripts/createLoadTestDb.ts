// Creates the throwaway load-test database (run like:
//   $env:DB_NAME_OVERRIDE = "taskmatrix_loadtest"; npm run loadtest:createdb).
//
// It connects with the same user, password and host the app already uses (nothing is typed or
// printed), and creates only the database named by DB_NAME_OVERRIDE. It refuses unless that name
// contains "loadtest" and the host is this machine.
import 'dotenv/config'
import mysql from 'mysql2/promise'
import { env } from '../config/env.js'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

const run = async () => {
    const target = new URL(env.DATABASE_URL)
    const dbName = decodeURIComponent(target.pathname.replace(/^\//, ''))

    if (!process.env.DB_NAME_OVERRIDE?.trim() || !/loadtest/i.test(dbName)) {
        console.error('Set DB_NAME_OVERRIDE to a name containing "loadtest" first, e.g. $env:DB_NAME_OVERRIDE = "taskmatrix_loadtest".')
        process.exit(1)
    }
    if (!LOCAL_HOSTS.has(target.hostname.toLowerCase())) {
        console.error(`Refusing: the database host is "${target.hostname}", not this machine. The load test must never run against a remote server.`)
        process.exit(1)
    }

    // Same server, no database selected yet: the new one does not exist.
    const server = new URL(env.DATABASE_URL)
    server.pathname = ''
    const connection = await mysql.createConnection(server.toString())
    try {
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
        console.log(`Database "${dbName}" is ready on ${target.hostname}:${target.port || '3306'}.`)
    } finally {
        await connection.end()
    }
}

run().catch((err) => {
    console.error('Could not create the database:', err instanceof Error ? err.message : err)
    console.error('If this says access denied for CREATE, the app user is not allowed to create databases; create it as root instead.')
    process.exit(1)
})
