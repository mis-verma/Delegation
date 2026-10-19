import { z } from 'zod';

export const arrayField = <T extends z.ZodTypeAny>(item: T) => z.array(item).catch([]);

export const withArrayDefaults = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape).passthrough();

export const normalizeWith = <T>(schema: z.ZodTypeAny, raw: unknown): T => schema.parse(raw) as T;
