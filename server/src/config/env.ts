import './loadEnv.js'
import { z } from 'zod'

const envSchema = z.object({
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    DATABASE_URL: z.string().min(1).optional(),
    DB_HOST: z.string().default('127.0.0.1'),
    DB_PORT: z.coerce.number().default(3306),
    DB_USER: z.string().default('root'),
    DB_PASSWORD: z.string().default(''),
    DB_NAME: z.string().default('taskmatrix'),
    DB_CONNECTION_LIMIT: z.coerce.number().default(20),
    TRUST_PROXY_HOPS: z.coerce.number().default(1),
    DB_TIMEZONE: z.string().optional(),

    CLIENT_URL: z.string().min(1),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    CLUSTER_WORKERS: z.coerce.number().optional(),

    CHECKLIST_TIMEZONE_OFFSET_MINUTES: z.coerce.number().default(330),
    PHOTO_SIMILAR_DISTANCE: z.coerce.number().int().min(0).max(16).default(4),
    CHECKLIST_DRAFT_REMINDER_HOURS: z.coerce.number().min(0).default(3),

    JWT_ACCESS_SECRET: z.string().min(10),

    COOKIE_SECURE: z.preprocess(
        (v) => (typeof v === 'string' ? ['true', '1', 'yes', 'on'].includes(v.trim().toLowerCase()) : v),
        z.boolean(),
    ).default(false),
    CRON_TIMEZONE: z.string().optional(),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

    ALLOW_SELF_REGISTRATION: z.preprocess(
        (v) => (typeof v === 'string' ? ['true', '1', 'yes', 'on'].includes(v.trim().toLowerCase()) : v),
        z.boolean(),
    ).default(false),

    AWS_REGION: z.string().default('us-east-1'),
    AWS_S3_BUCKET: z.string().default(''),
    AWS_ACCESS_KEY_ID: z.string().default(''),
    AWS_SECRET_ACCESS_KEY: z.string().default(''),

    VAPID_PUBLIC_KEY: z.string().default(''),
    VAPID_PRIVATE_KEY: z.string().default(''),
    VAPID_SUBJECT: z.string().default(''),

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

if (data.NODE_ENV === 'production' && !data.COOKIE_SECURE) {
    throw new Error('COOKIE_SECURE must be true when NODE_ENV=production (the refresh-token cookie must be sent over HTTPS only).');
}

if (data.NODE_ENV === 'production' && data.JWT_ACCESS_SECRET.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be at least 32 characters in production. Use a random value of 48 or more characters.');
}

const baseDatabaseUrl =
    data.DATABASE_URL ??
    `mysql://${encodeURIComponent(data.DB_USER)}:${encodeURIComponent(data.DB_PASSWORD)}@${data.DB_HOST}:${data.DB_PORT}/${data.DB_NAME}`;

const resolvedDatabaseUrl = (() => {
    const override = process.env.DB_NAME_OVERRIDE?.trim();
    if (!override) return baseDatabaseUrl;
    const url = new URL(baseDatabaseUrl);
    url.pathname = `/${encodeURIComponent(override)}`;
    return url.toString();
})();

export const env = { ...data, DATABASE_URL: resolvedDatabaseUrl };
