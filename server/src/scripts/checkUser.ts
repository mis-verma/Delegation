import '../config/loadEnv.js'
import { connectDB, disconnectDB, db } from '../config/db.js'
import { users } from '../db/schema/index.js'
import { eq } from 'drizzle-orm'

const run = async () => {
    const rawEmail = process.argv[2];
    if (!rawEmail) {
        console.error('Usage: npx tsx src/scripts/checkUser.ts <email>');
        process.exit(1);
    }

    const email = rawEmail.trim().toLowerCase();

    await connectDB();

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user) {
        console.log(`No account found for "${email}".`);
    } else {
        console.log('Account found:');
        console.log(`  email:      ${user.email}`);
        console.log(`  role:       ${user.role}`);
        console.log(`  isActive:   ${user.isActive}`);
        console.log(`  hasPassword: ${!!user.passwordHash}`);
        console.log(`  createdAt:  ${user.createdAt}`);
    }

    await disconnectDB();
    process.exit(0);
}

run();
