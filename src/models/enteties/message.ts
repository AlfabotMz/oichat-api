import { z } from "zod/v4";
import { IDSchema, JIDSchema } from "./IDSchema.ts";


export const MessageSchema = z.object({
  id: IDSchema,
  content: z.string().min(1),
  fromMe: z.boolean(),
  conversationId: IDSchema,
  senderId: JIDSchema,
  timestamp: z.iso.datetime(),
});

export const WebMessageSchema = MessageSchema.omit({
  senderId: true,
  timestamp: true,
});

export type WebMessage = z.infer<typeof WebMessageSchema>;
export type Message = z.infer<typeof MessageSchema>;