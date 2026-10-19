import { GoogleGenAI, Type } from "@google/genai";
import { EXTRACTION_JSON_SCHEMA, buildExtractionPrompt, type RawExtraction } from "../schema.js";
import { withTimeout, lazyClient } from "../../../../utils/index.js";

const EXTRACTION_TIMEOUT_MS = 20_000

const getClient = lazyClient("GEMINI_API_KEY", () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }))

const GEMINI_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: EXTRACTION_JSON_SCHEMA.properties.title.description },
        context: { type: Type.STRING, description: EXTRACTION_JSON_SCHEMA.properties.context.description },
        assigneeName: { type: Type.STRING, description: EXTRACTION_JSON_SCHEMA.properties.assigneeName.description },
        department: { type: Type.STRING, description: EXTRACTION_JSON_SCHEMA.properties.department.description },
        dueDateISO: { type: Type.STRING, description: EXTRACTION_JSON_SCHEMA.properties.dueDateISO.description },
        category: { type: Type.STRING, enum: ["issue", "delegated_task"] },
        confidence: { type: Type.NUMBER },
    },
    required: [...EXTRACTION_JSON_SCHEMA.required],
};

export async function extractWithGemini(rawInput: string, referenceDate: Date): Promise<RawExtraction> {
    const response = await withTimeout(getClient().models.generateContent({
        model: "gemini-flash-latest",
        contents: [{ role: "user", parts: [{ text: buildExtractionPrompt(rawInput, referenceDate) }] }],
        config: { responseMimeType: "application/json", responseSchema: GEMINI_SCHEMA },
    }), EXTRACTION_TIMEOUT_MS, "Gemini extraction");
    if (!response.text) throw new Error("Gemini returned no extraction text");
    return JSON.parse(response.text) as RawExtraction;
}
