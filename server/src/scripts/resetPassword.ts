// One-off command-line script for account recovery when someone forgets their password and email
// (SMTP_*) isn't configured for the normal forgot-password flow. Run like:
//   npm run reset:password -- someone@example.com NewPassw0rd!
import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { connectDB, disconnectDB, db } from '../config/db.js'
import { users } from '../db/schema/index.js'
import { hashPassword } from '../utils/password.js'

const run = async () => {
    const email = process.argv[2];
    const newPassword = process.argv[3];

    if (!email || !newPassword) {
        console.error('Usage: npm run reset:password -- <email> <newPassword>');
        process.exit(1);
    }

    await connectDB();

    const normalizedEmail = email.toLowerCase();
    const passwordHash = await hashPassword(newPassword);

    const result = await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.email, normalizedEmail));

    if (result[0].affectedRows === 0) {
        console.error(`No user found with email ${email}`);
    } else {
        console.log(`Password reset for ${normalizedEmail}`);
    }

    await disconnectDB();
    process.exit(0);
};

run().catch(async (err) => {
    console.error('Password reset failed:', err);
    await disconnectDB();
    process.exit(1);
});
