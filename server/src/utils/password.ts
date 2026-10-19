import { hash, compare } from "@node-rs/bcrypt";
import { DEFAULT_RANK_BY_ROLE, type Role } from "../db/schema/core.js";

const BCRYPT_COST = 12;

export const hashPassword = (plain: string): Promise<string> => hash(plain, { cost: BCRYPT_COST });

export const comparePassword = async (plain: string, hashed: string): Promise<boolean> => {
  try {
    return await compare(plain, hashed);
  } catch {
    return false;
  }
};

export const deriveDefaultRank = (role: Role, rank?: number | null): number =>
  rank ?? DEFAULT_RANK_BY_ROLE[role] ?? DEFAULT_RANK_BY_ROLE.USER;
