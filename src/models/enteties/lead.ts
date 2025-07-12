import { z } from "zod/v4";
import { IDSchema, JIDSchema, LIDSchema } from "./IDSchema.ts";

export const CONVERSION_TYPE = ["ORDER", "SALE"] as const;
export const STATUS = ["FAILED", "SUCCESS", "PENDING", "FOLLOW_UP", "LOSE"] as const;
export const LeadSchema = z.object({
  id: IDSchema,
  userId: IDSchema,
  agentId: IDSchema,
  whatsappJid: JIDSchema,
  whatsappLid: LIDSchema,
  conversionType: z.enum(CONVERSION_TYPE).nullable(),
  status: z.enum(STATUS),
  createdAt: z.coerce.date(),
  lastContactAt: z.coerce.date().optional(),
  lastAgentMessageAt: z.coerce.date().optional(),
});

export const CreateLeadSchema = LeadSchema.omit({
  id: true,
  createdAt: true,
  lastContactAt: true,
  lastAgentMessageAt: true,
});

export type Lead = z.infer<typeof LeadSchema>;
export type CreateLead = z.infer<typeof CreateLeadSchema>;