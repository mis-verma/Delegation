import 'dotenv/config'
import { connectDB, disconnectDB, db } from '../config/db.js'
import { users } from '../db/schema/index.js'
import { eq } from 'drizzle-orm'

const run = async () => {
    const email = process.argv[2];
    if(!email){
        console.error("Usage : npm run seed : admin ---<email>")
        process.exit(1)
    }

    await connectDB()

    const normalizedEmail = email.toLowerCase();

    await db.update(users).set({ role: "ADMIN", updatedAt: new Date() }).where(eq(users.email, normalizedEmail));
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.email, normalizedEmail)).limit(1);

    if(!user){
        console.error(`No user found with email ${email} -- sign up first, then run this.`)
    }else {
        console.log(`${user.email} is now ADMIN`)
    }

    await disconnectDB();
    process.exit(0)

}

run()
