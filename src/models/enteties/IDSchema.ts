import z from "zod/v4";
import { ID, WhatsappJid, WhatsappLid } from "../../shared/types.ts";

export const IDSchema = z.uuid().transform((val) => ID.from(val));
export const JIDSchema = z.string().transform((val) => WhatsappJid.from(val));
export const LIDSchema = z.string().transform((val) => WhatsappLid.from(val));
