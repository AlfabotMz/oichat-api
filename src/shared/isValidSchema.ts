import { ZodSchema } from "zod";

export type ValidType<T> = { data: T, isValid: true }
export type InvalidType = { error: Error, isValid: false }
export type IsValidType<T> = ValidType<T> | InvalidType

export async function isValidSchema<T>(schema: ZodSchema<T>, data: unknown): Promise<IsValidType<T>> {
    const result = schema.safeParse(data);
    if (!result.success) return { error: result.error, isValid: false };
    return { data: result.data, isValid: true };
  }
  