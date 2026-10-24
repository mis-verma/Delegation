import crypto from "node:crypto"
import { env } from "../../config/env.js"

const MAX_AUDIO_BYTES = 25 * 1024 * 1024
const SEND_TEXT_URL = "https://public.doubletick.io/whatsapp/message/text"

export async function sendDoubleTickMessage(to: string, body: string) {
    const res = await fetch(SEND_TEXT_URL, {
        method: "POST",
        headers: {
            Authorization: env.DOUBLETICK_API_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: env.DOUBLETICK_SENDER_NUMBER,
            to,
            content: { text: body },
        }),
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
        console.error("DoubleTick send failed : ", await res.text())
    }
}

export function verifyDoubleTickAuth(secret: string | undefined): boolean {
    if (!secret || !env.DOUBLETICK_WEBHOOK_SECRET) return false;
    const expected = Buffer.from(env.DOUBLETICK_WEBHOOK_SECRET);
    const provided = Buffer.from(secret);
    return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

const ALLOWED_AUDIO_HOST_SUFFIXES = ["doubletick.io"]

const toss = (msg : string) : never => { throw new Error(msg)}


function assertSafeAudioUrl(url : string) : URL {
    let parsed : URL;
    try{
        parsed = new URL(url);
    }catch{
        return toss(`Invalid DoubleTick audio URL : ${url}`)
    }

    parsed.protocol === "https:" || toss(`Rejected non-HTTPS DoubleTick audio URL : ${url}`)
    const isAllowed = ALLOWED_AUDIO_HOST_SUFFIXES.some((suffix) => parsed.hostname === suffix || parsed.hostname.endsWith(`.${suffix}`))
    isAllowed || toss(`Rejected DoubleTick audio URL with untrusted host: ${parsed.hostname}`)
    return parsed;
}


export async function downloadDoubleTickAudio(url : string) : Promise<{ buffer : Buffer, mimeType : string}>{
    const safeUrl = assertSafeAudioUrl(url);
    const res = await fetch(safeUrl, { redirect: "error", signal: AbortSignal.timeout(30_000) })
    if(!res.ok) throw new Error(`Failed to download DoubleTick audio ${url}`);
    if (Number(res.headers.get("content-length") ?? 0) > MAX_AUDIO_BYTES) throw new Error("DoubleTick audio is larger than the allowed size");
    const mimeType = res.headers.get("content-type") || "audio/mpeg";
    return { buffer : Buffer.from(await res.arrayBuffer()), mimeType}
}
