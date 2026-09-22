import nodemailer from "nodemailer"
import { env } from "./env.js"
import { settingsService } from "../modules/settings/settings.service.js"

// Lazily-created transporter, cached after the first send so we don't reconnect/re-create a test
// account on every email. Real SMTP (when SMTP_HOST is configured) is created synchronously; the
// Ethereal fallback is created asynchronously on first use since it has to hit Ethereal's API.
let transporterPromise: Promise<nodemailer.Transporter> | null = null;

const buildTransporter = async () => {
    if (env.SMTP_HOST) {
        // Real SMTP configured (Gmail, SendGrid, Mailtrap, your own provider, etc.) — use it.
        return nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_PORT === 465,
            auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        });
    }

    // No SMTP configured — fall back to Ethereal (nodemailer's free throwaway test-inbox service).
    // Nothing is delivered to a real inbox, but the send still genuinely happens over real SMTP,
    // and nodemailer.getTestMessageUrl() gives back a URL where the "sent" email can be viewed.
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
    if (!transporterPromise) transporterPromise = buildTransporter();
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

    // Always log something useful to the console — the Ethereal preview URL when there's no real
    // SMTP configured (so you can actually open and read the email during development), or just a
    // confirmation line when real SMTP is in use.
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
        console.log(`[mailer] Email sent (dev preview): ${previewUrl}`);
    } else {
        console.log(`[mailer] Email sent to ${to}: ${subject}`);
    }
};
