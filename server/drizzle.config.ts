import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL ?? "mysql://root:@127.0.0.1:3306/taskmatrix";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: { url: databaseUrl },
});
