import { z } from "zod/v4";
import { IDSchema } from "./IDSchema.ts";

// Enum de tipo de conversão
export const CONVERSION_TYPE = ["ORDER", "SALE"] as const;

// Schema principal da conversão
export const ConversionSchema = z.object({
  id: IDSchema,
  leadId: IDSchema,
  userId: IDSchema,
  agentId: IDSchema,
  type: z.enum(CONVERSION_TYPE),
  value: z.number().positive().nullable(),         // valor da venda, se aplicável
  notes: z.string().nullable(),
  createdAt: z.coerce.date()
});

export const CreateConversionSchema = ConversionSchema.omit({
  id: true,
  createdAt: true
});

export type Conversion = z.infer<typeof ConversionSchema>;
export type CreateConversion = z.infer<typeof CreateConversionSchema>;