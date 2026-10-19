import OpenAI from "openai";
import { toFile } from "openai";
import { GoogleGenAI } from "@google/genai";
import { downloadWhatsAppMedia } from "./whatsapp.service.js";
import { lazyClient } from "../../utils/index.js";

const getOpenAI = lazyClient("OPENAI_API_KEY", () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY }))
const getGemini = lazyClient("GEMINI_API_KEY", () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }))

async function transcribeWithWhisper(buffer: Buffer, mimeType: string): Promise<string> {
    const file = await toFile(buffer, "voice-note.ogg", { type: mimeType });
    const transcription = await getOpenAI().audio.transcriptions.create({
        file,
        model: "whisper-1",
    });
    return transcription.text;
}

async function transcribeWithGemini(buffer: Buffer, mimeType: string): Promise<string> {
    const response = await getGemini().models.generateContent({
        model: "gemini-flash-latest",
        contents: [{
            role: "user",
            parts: [
                { text: "Transcribe this voice message word-for-word. Reply with only the transcript, nothing else." },
                { inlineData: { mimeType, data: buffer.toString("base64") } },
            ],
        }],
    });
    const text = response.text?.trim();
    if (!text) throw new Error("Gemini returned an empty transcript");
    return text;
}

export async function transcribeVoiceNote(buffer: Buffer, mimeType: string): Promise<string> {
    if (process.env.OPENAI_API_KEY) {
        try {
            return await transcribeWithWhisper(buffer, mimeType);
        } catch (err) {
            console.error("Whisper transcription failed, falling back to Gemini:", err);
        }
    }

    return transcribeWithGemini(buffer, mimeType);
}

export async function transcribeWhatsAppVoiceNote(mediaId: string): Promise<string> {
    const { buffer, mimeType } = await downloadWhatsAppMedia(mediaId);
    return transcribeVoiceNote(buffer, mimeType);
}
