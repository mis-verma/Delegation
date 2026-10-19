import { db } from "../../config/db.js";
import { events, users } from "../../db/schema/core.js";
import { eq, gte, asc } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { AppError } from "../../utils/AppError.js";
import type { CreateEventInput, UpdateEventInput } from "./event.validation.js";
import { auditService } from "../audit/audit.service.js";

const listWithCreator = () =>
    db
        .select({
            id: events.id,
            title: events.title,
            description: events.description,
            type: events.type,
            eventDate: events.eventDate,
            createdBy: events.createdBy,
            createdAt: events.createdAt,
            updatedAt: events.updatedAt,
            creator: { firstName: users.firstName, lastName: users.lastName },
        })
        .from(events)
        .leftJoin(users, eq(events.createdBy, users.id));

export const eventService = {
    async list() {
        return listWithCreator().orderBy(asc(events.eventDate));
    },

    async listUpcoming(limit: number) {
        return listWithCreator().where(gte(events.eventDate, new Date())).orderBy(asc(events.eventDate)).limit(limit);
    },

    async getById(id: string) {
        const [event] = await listWithCreator().where(eq(events.id, id)).limit(1);
        if (!event) throw AppError.notFound("Event not found")
        return event
    },

    async create(input: CreateEventInput, createdBy: string) {
        const id = createId();
        await db.insert(events).values({
            id,
            title: input.title,
            description: input.description ?? null,
            type: input.type,
            eventDate: new Date(input.eventDate),
            createdBy,
        });
        const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
        await auditService.record({ entityType: "Event", entityId: id, action: "CREATE", actorId: createdBy, after: event });
        return event
    },

    async update(id: string, input: UpdateEventInput, actorId: string) {
        const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
        if (!existing) throw AppError.notFound("Event not found")

        await db.update(events).set({
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.type !== undefined ? { type: input.type } : {}),
            ...(input.eventDate !== undefined ? { eventDate: new Date(input.eventDate) } : {}),
            updatedAt: new Date(),
        }).where(eq(events.id, id));

        const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
        await auditService.record({ entityType: "Event", entityId: id, action: "UPDATE", actorId, before: existing, after: event });
        return event
    },

    async remove(id: string, actorId: string) {
        const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
        if (!event) throw AppError.notFound("Event not found")
        await db.delete(events).where(eq(events.id, id));
        await auditService.record({ entityType: "Event", entityId: id, action: "DELETE", actorId, before: event });
        return event
    }
}
