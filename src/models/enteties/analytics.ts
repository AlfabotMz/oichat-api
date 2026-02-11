import { z } from "zod/v4";
import { IDSchema } from "./IDSchema.ts";

export const AnalyticsSchema = z.object({
    id: IDSchema.optional(),
    agentId: IDSchema,
    totalMessages: z.number().default(0),
    totalConversations: z.number().default(0),
    avgResponseTime: z.number().nullable().optional(),
    date: z.string().optional(), // date in 'YYYY-MM-DD' format
    createdAt: z.coerce.date().optional(),
    conversions: z.number().default(0),
})

export type Analytics = z.infer<typeof AnalyticsSchema>;
export type CreateAnalytics = Omit<Analytics, 'id' | 'createdAt'>;
