import { getIO } from "./socket.js"

export type RoomTarget = {
    userId?: string | null;
    assigneeId?: string | null;
    departmentId?: string | null;
    storeId?: string | null;
};

type Rooms = { private: string[]; shared: string[] };

const roomsFor = (target: RoomTarget): Rooms => {
    const privateRooms = new Set<string>(["role:ADMIN"]);
    const sharedRooms = new Set<string>();
    if (target.userId) privateRooms.add(`user:${target.userId}`);
    if (target.assigneeId) privateRooms.add(`user:${target.assigneeId}`);
    if (target.departmentId) sharedRooms.add(`department:${target.departmentId}`);
    if (target.storeId) sharedRooms.add(`store:${target.storeId}`);
    return { private: [...privateRooms], shared: [...sharedRooms] };
};

const idOnly = (payload: unknown): { id?: unknown } => {
    if (payload !== null && typeof payload === "object" && "id" in payload) return { id: (payload as { id: unknown }).id };
    return {};
};

export const emitRoomEvent = (event: string, target: RoomTarget, payload: unknown) => {
    const io = getIO();
    const rooms = roomsFor(target);
    rooms.private.forEach((room) => io.to(room).emit(event, payload));
    const minimal = idOnly(payload);
    rooms.shared.forEach((room) => io.to(room).emit(event, minimal));
};
