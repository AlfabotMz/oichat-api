import { z } from "zod/v4";
import { IDSchema } from "./IDSchema.ts";

export const AGENT_STATUS = ["ACTIVE", "INACTIVE"] as const;
export type AgentStatus = (typeof AGENT_STATUS)[number];


export const AgentSchema = z.object({
  id: IDSchema,
  userId: IDSchema,
  name: z.string().min(1),
  phoneNumber: z.string().nullable().optional(),
  status: z.string().nullable().optional().default("active"),
  n8nWebhookUrl: z.string().url().nullable().optional(),
  instanceName: z.string().nullable().optional(),
  prompt: z.string().nullable().optional(),
  anexos: z.any().nullable().optional().default({}),
  contactOwner: z.string().nullable().optional(),
  contactDelivery: z.string().nullable().optional(),
  product: z.string().nullable().optional(),
  messageDelay: z.number().nullable().optional().default(0),
  amount: z.string().nullable().optional(),
  customMessage: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const CreateAgentSchema = AgentSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const UpdateAgentSchema = AgentSchema.omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
}).partial();


export type CreateAgent = z.infer<typeof CreateAgentSchema>;
export type UpdateAgent = z.infer<typeof UpdateAgentSchema>;
export type Agent = z.infer<typeof AgentSchema>;
