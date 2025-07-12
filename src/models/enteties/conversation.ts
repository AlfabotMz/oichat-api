import z from "zod/v4";
import { MessageSchema } from "./message.ts";
import { IDSchema } from "./IDSchema.ts";


export const ConversationSchema = z.object({
    id: IDSchema,
    messages: z.array(MessageSchema),
    leadId: IDSchema,
    agentId: IDSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  });

export type Conversation = z.infer<typeof ConversationSchema>;