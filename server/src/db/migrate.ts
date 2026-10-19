import mysql from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import { migrate } from 'drizzle-orm/mysql2/migrator'
import { env } from '../config/env.js'

const run = async () => {
    const connection = await mysql.createConnection(env.DATABASE_URL);
    const db = drizzle(connection);

    console.log('Running pending migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('Migrations complete.');

    await connection.end();
};

run().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
