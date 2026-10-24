import crypto from "node:crypto"
import { env } from "../../config/env.js"

const GRAPH_API_VERSION = "v20.0"

export async function sendWhatsAppMessage(to:string, body:string) {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`
    const res = await fetch(url, {
        method : "POST",
        headers : {
            Authorization : `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
            "Content-Type" : "application/json",
        },

        body: JSON.stringify({
            messaging_product : "whatsapp",
            to,
            text : { body },
        }),
        signal: AbortSignal.timeout(15_000),
    });
    if(!res.ok){
        console.error("WhatsApp send failed : ", await res.text())
    }
}

export async function downloadWhatsAppMedia(mediaId:string):Promise<{buffer: Buffer; mimeType : string}> {
    const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`, {
        headers : { Authorization : `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`},
        signal: AbortSignal.timeout(15_000),
    });

    if(!metaRes.ok)throw new Error(`Failed to look up media ${mediaId} : ${await metaRes.text()}`);
    const { url, mime_type } = await metaRes.json() as { url : string, mime_type : string};

    const fileRes = await fetch(url, {
        headers : { Authorization : `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`},
        signal: AbortSignal.timeout(30_000),
    });

    if(!fileRes.ok) throw new Error(`Failed to download media : ${mediaId}`);
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    return { buffer , mimeType : mime_type}
    
}

export function verifySignature(rawBody : Buffer, signatureHeader : string | undefined) : boolean {
    if(!env.WHATSAPP_APP_SECRET) return false;
    if(!signatureHeader?.startsWith("sha256=")) return false;
    const expected = crypto.createHmac("sha256", env.WHATSAPP_APP_SECRET).update(rawBody).digest("hex");
    const provided = signatureHeader.slice("sha256=".length)
    const a = Buffer.from(expected , "hex")
    const b = Buffer.from(provided, "hex")

    return a.length === b.length && crypto.timingSafeEqual(a,b);
}