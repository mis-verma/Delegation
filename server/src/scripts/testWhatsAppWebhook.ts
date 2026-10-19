import "dotenv/config"
import crypto from "node:crypto"
import { env } from "../config/env.js"

const run = async() => {
    const phone = process.argv[2];
    const text = process.argv[3];

    if(!phone || !text) {
        console.error("Usage : npx tsx src/scripts/testWhatsAppWebhook.ts <phone> <message text>");
        process.exit(1)
    }
    
    const payload = {
        object : "whatsapp_bussiness_account",
        entry : [{
            id : "test-entry",
            changes : [{
                field : "messages",
                value : {
                    messaging_product : "whatsapp",
                    metadata : { display_phone_number : phone , phone_number_id : env.WHATSAPP_PHONE_NUMBER_ID},
                    messages : [{ from : phone, id : `test-message-${Date.now()}`, type : "text", text : { body : text}}],
                },
            }],
        }],
    };

    const body = JSON.stringify(payload);
    const signature = "sha256=" + crypto.createHmac("sha256", env.WHATSAPP_APP_SECRET).update(body).digest("hex");

    const res = await fetch(`http://localhost:${env.PORT}/whatsapp/webhook`, {
        method : "POST",
        headers : {
            "Content-Type" : "application/json",
            "x-hub-signature-256" : signature,
        },
        body,
    });

    console.log(`Webhook responded : `,res.status)
    console.log(`Check your server terminal for the actual processing logs, and your dashboard for the created task.`)

};

run();
