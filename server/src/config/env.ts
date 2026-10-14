import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // MySQL connection. Prefer a single DATABASE_URL (mysql://user:pass@host:port/db),
    // which is what Drizzle/mysql2 and most cPanel Node.js setups expect. Discrete
    // DB_* vars are also accepted and assembled into a URL if DATABASE_URL is absent
    // (handy for cPanel's "Setup Node.js App" env-var UI, which some hosts make easier
    // to fill in as separate fields than as one connection string).
    DATABASE_URL: z.string().min(1).optional(),
    DB_HOST: z.string().default('127.0.0.1'),
    DB_PORT: z.coerce.number().default(3306),
    DB_USER: z.string().default('root'),
    DB_PASSWORD: z.string().default(''),
    DB_NAME: z.string().default('taskmatrix'),
    DB_CONNECTION_LIMIT: z.coerce.number().default(10),
    TRUST_PROXY_HOPS: z.coerce.number().default(1),
    // How the database driver reads and writes DATETIME values: 'Z' (UTC) or an offset like '+05:30'.
    // Left unset it follows the host machine's own time zone, which is the historic behaviour. Set it to
    // 'Z' once the host is known to be UTC (or you want it pinned), so a move to a differently configured
    // server can never shift every stored date.
    DB_TIMEZONE: z.string().optional(),

    CLIENT_URL: z.string().min(1),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    CLUSTER_WORKERS: z.coerce.number().optional(),

    CHECKLIST_TIMEZONE_OFFSET_MINUTES: z.coerce.number().default(330),
    // Hours of inactivity after someone starts a checklist (completes at least one item) before
    // checklistDraftReminder.job.ts nudges them to finish it. 0 disables the sweep entirely.
    CHECKLIST_DRAFT_REMINDER_HOURS: z.coerce.number().min(0).default(3),
    // Retention periods (used to be AUDIT_RETENTION_DAYS/NOTIFICATION_RETENTION_DAYS/
    // INBOUND_MESSAGE_RETENTION_DAYS here) are now admin-configurable at runtime — see the
    // `settings` table's auditRetentionDays/notificationRetentionDays/inboundMessageRetentionDays
    // columns and Admin → Settings.

    JWT_ACCESS_SECRET: z.string().min(10),
    // Token lifetimes (used to be JWT_ACCESS_EXPIRES_IN/JWT_REFRESH_EXPIRES_IN_DAYS here) are now
    // admin-configurable at runtime — see the `settings` table's accessTokenExpiresMinutes/
    // refreshTokenExpiresDays columns and Admin → Settings.

    COOKIE_SECURE: z.coerce.boolean().default(false),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

    // POST /auth/register is closed by default: accounts are created by an admin. Set to "true" to
    // let anyone sign themselves up (they start as a plain USER with no department/store).
    // Parsed from the string explicitly: z.coerce.boolean() would treat "false" as true.
    ALLOW_SELF_REGISTRATION: z.preprocess(
        (v) => (typeof v === 'string' ? ['true', '1', 'yes', 'on'].includes(v.trim().toLowerCase()) : v),
        z.boolean(),
    ).default(false),

    AWS_REGION: z.string().default('us-east-1'),
    AWS_S3_BUCKET: z.string().default(''),
    AWS_ACCESS_KEY_ID: z.string().default(''),
    AWS_SECRET_ACCESS_KEY: z.string().default(''),

    SMTP_HOST: z.string().default(''),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string().default(''),
    SMTP_PASS: z.string().default(''),
    MAIL_FROM: z.string().default(''),


    WHATSAPP_VERIFY_TOKEN: z.string().default(""),
    WHATSAPP_ACCESS_TOKEN: z.string().default(""),
    WHATSAPP_PHONE_NUMBER_ID: z.string().default(""),
    WHATSAPP_APP_SECRET: z.string().default(""),


    DOUBLETICK_API_KEY: z.string().default(""),
    DOUBLETICK_WEBHOOK_SECRET: z.string().default(""),
    DOUBLETICK_SENDER_NUMBER: z.string().default(""),


});

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
    console.error('Invalid enviroment variables : ', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid enviroment variables')
}

const data = parsed.data;

// COOKIE_SECURE gates the `Secure` flag on the httpOnly refresh-token cookie. Defaulting it to
// false is right for local dev (no TLS), but the same default silently reaching production means
// that cookie would be sendable over plain HTTP — refuse to boot rather than ship that quietly.
if (data.NODE_ENV === 'production' && !data.COOKIE_SECURE) {
    throw new Error('COOKIE_SECURE must be true when NODE_ENV=production (the refresh-token cookie must be sent over HTTPS only).');
}

// Build a single connection URL if one wasn't provided directly. mysql2 (and Drizzle's
// mysql2 driver) accept a plain `mysql://user:pass@host:port/db` URL, so this keeps
// db.ts simple regardless of which style of env vars the host provides.
const baseDatabaseUrl =
    data.DATABASE_URL ??
    `mysql://${encodeURIComponent(data.DB_USER)}:${encodeURIComponent(data.DB_PASSWORD)}@${data.DB_HOST}:${data.DB_PORT}/${data.DB_NAME}`;

// DB_NAME_OVERRIDE swaps only the database NAME in whatever connection the app already uses, keeping
// the same user, password and host. It exists for the load test (see server/loadtest/README.md): point
// the server, migrations and seed script at a throwaway database with one variable, without ever
// retyping or exposing the real credentials. Never set it in a real deployment.
const resolvedDatabaseUrl = (() => {
    const override = process.env.DB_NAME_OVERRIDE?.trim();
    if (!override) return baseDatabaseUrl;
    const url = new URL(baseDatabaseUrl);
    url.pathname = `/${encodeURIComponent(override)}`;
    return url.toString();
})();

export const env = { ...data, DATABASE_URL: resolvedDatabaseUrl };
