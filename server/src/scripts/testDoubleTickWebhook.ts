import '../config/loadEnv.js'
import { env } from "../config/env.js"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async () => {
    const phone = process.argv[2];
    const messages = process.argv.slice(3);

    if (!phone || messages.length === 0) {
        console.error("Usage : npx tsx src/scripts/testDoubleTickWebhook.ts <phone> <message1> [message2] [message3] ...");
        process.exit(1)
    }

    for (let i = 0; i < messages.length; i++) {
        const text = messages[i];
        const payload = {
            to: env.DOUBLETICK_SENDER_NUMBER,
            from: phone,
            messageId: `test-message-${Date.now()}-${i}`,
            dtMessageId: `test-dt-message-${Date.now()}-${i}`,
            receivedAt: new Date().toISOString(),
            contact: { name: "Test Contact" },
            integrationType: "WHATSAPP",
            message: { type: "TEXT", text, context: {} },
        };

        const res = await fetch(`http://localhost:${env.PORT}/doubletick/webhook/${env.DOUBLETICK_WEBHOOK_SECRET}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        console.log(`> "${text}" -> ${res.status}`)
        if (i < messages.length - 1) {
            await sleep(i === 0 ? 4000 : 1500);
        }
    }

    console.log(`Check your server terminal for the actual processing logs, and your dashboard for the created task.`)
};

run();
