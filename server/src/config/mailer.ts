import nodemailer from "nodemailer"
import type { Transporter } from "nodemailer"
import { env } from "./env.js"
import { settingsService } from "../modules/settings/settings.service.js"

let transporterPromise: Promise<Transporter> | null = null;

const buildTransporter = async () => {
    if (env.SMTP_HOST) {
        return nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_PORT === 465,
            auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
            connectionTimeout: 10_000,
            greetingTimeout: 10_000,
            socketTimeout: 20_000,
        });
    }

    if (env.NODE_ENV === 'production') {
        throw new Error('Email is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS before sending email.');
    }

    console.warn("[mailer] No SMTP_HOST configured — using a temporary Ethereal test inbox for email. Set SMTP_HOST/SMTP_USER/SMTP_PASS in .env to send real email.");
    const testAccount = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: { user: testAccount.user, pass: testAccount.pass },
    });
};

const getTransporter = () => {
    if (!transporterPromise) {
        transporterPromise = buildTransporter().catch((err) => {
            transporterPromise = null;
            throw err;
        });
    }
    return transporterPromise;
};

export const sendMail = async ({ to, subject, html }: { to: string; subject: string; html: string }) => {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
        from: env.MAIL_FROM || `"${settingsService.getCached().orgName}" <no-reply@task-matrix.local>`,
        to,
        subject,
        html,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
        console.log(`[mailer] Email sent (dev preview): ${previewUrl}`);
    } else {
        console.log(`[mailer] Email sent to ${to}: ${subject}`);
    }
};
