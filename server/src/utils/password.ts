// Replaces two things that used to live on the Mongoose User model:
//   1. the `password` virtual setter + pre('validate') hook that bcrypt-hashed it, and
//   2. the pre('validate') hook that defaulted `rank` from `role` when null.
// Drizzle has no document-level hooks, so every call site that used to do
// `user.password = plain; await user.save()` now calls `hashPassword(plain)` explicitly
// before inserting/updating, and every user-create path calls `deriveDefaultRank(role, rank)`.
// Native bcrypt (@node-rs/bcrypt) instead of bcryptjs. bcryptjs is pure JavaScript, so at cost 12 every
// sign-in kept the server's one main thread busy for most of a second: 49 people signing in together
// meant a median wait of ~15 s and slow answers to everyone else too. The native build runs on
// worker threads, leaving the main thread free. Hashes are interchangeable in both directions
// (same $2b$ format), so every existing password keeps working and nothing needs re-hashing.
import { hash, compare } from "@node-rs/bcrypt";
import { DEFAULT_RANK_BY_ROLE, type Role } from "../db/schema/core.js";

const BCRYPT_COST = 12;

export const hashPassword = (plain: string): Promise<string> => hash(plain, { cost: BCRYPT_COST });

// A password this library cannot process (for example too long) is simply "wrong", never a 500.
export const comparePassword = async (plain: string, hashed: string): Promise<boolean> => {
  try {
    return await compare(plain, hashed);
  } catch {
    return false;
  }
};

export const deriveDefaultRank = (role: Role, rank?: number | null): number =>
  rank ?? DEFAULT_RANK_BY_ROLE[role] ?? DEFAULT_RANK_BY_ROLE.USER;
