import { z } from "zod/v4";
import { IDSchema } from "./IDSchema.ts";

export const AGENT_STATUS = ["ACTIVE", "INACTIVE"] as const;
export type AgentStatus = (typeof AGENT_STATUS)[number];


export const AgentSchema = z.object({
    id: IDSchema,
    userId: IDSchema,
    status: z.enum(AGENT_STATUS).default("ACTIVE"),
    name: z.string().min(1),
    description: z.string().min(1),
    prompt: z.string().min(1),
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
