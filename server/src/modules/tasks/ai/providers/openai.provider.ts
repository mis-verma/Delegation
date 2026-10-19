import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { buildExtractionPrompt, type RawExtraction } from "../schema.js";
import { withTimeout, lazyClient } from "../../../../utils/index.js";

const EXTRACTION_TIMEOUT_MS = 20_000

const getClient = lazyClient("OPENAI_API_KEY", () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY }))

const ExtractionZod = z.object({
    title: z.string(),
    context: z.string(),
    assigneeName: z.string(),
    department: z.string(),
    dueDateISO: z.string(),
    category: z.enum(["issue", "delegated_task"]),
    confidence: z.number(),
});

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export async function extractWithOpenAI(rawInput: string, referenceDate: Date): Promise<RawExtraction> {
    const completion = await withTimeout(getClient().chat.completions.parse({
        model: OPENAI_MODEL,
        messages: [{ role: "user", content: buildExtractionPrompt(rawInput, referenceDate) }],
        response_format: zodResponseFormat(ExtractionZod, "task_extraction"),
    }), EXTRACTION_TIMEOUT_MS, "OpenAI extraction");
    const parsed = completion.choices[0]?.message.parsed;
    if (!parsed) throw new Error("OpenAI returned no parsed extraction");
    return parsed;
}
