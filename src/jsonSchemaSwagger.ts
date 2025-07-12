export const CreateAgentSchemaJson = {
    type: "object",
  properties: {
    userId: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
    name: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    prompt: { type: "string", minLength: 1 },
  },
  required: ["userId", "name", "description", "prompt"],
  additionalProperties: false,
};

export const UpdateAgentSchemaJson = {
    type: "object",
  properties: {
    status: { type: "string", enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
    name: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    prompt: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
};

export const AgentSchemaJson = {
    type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    userId: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
    name: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    prompt: { type: "string", minLength: 1 },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
    required: ["id", "userId", "status", "name", "description", "prompt", "createdAt", "updatedAt"],
  additionalProperties: false,
};

export const WebMessageSchemaJson = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    content: { type: "string", minLength: 1 },
    fromMe: { type: "boolean" },
    conversationId: { type: "string", format: "uuid" },
  },
  required: ["id", "content", "fromMe", "conversationId"],
  additionalProperties: false,
};

export const ErrorResponseSchemaJson = {
  type: "object",
  properties: {
    error: { type: "string" },
    details: { type: "object", additionalProperties: true },
  },
  required: ["error", "details"],
  additionalProperties: false,
};

export const WhatsappCreateInstanceSchemaJson = {
  type: "object",
  properties: {
    instance: { type: "string", description: "The name of the instance to create." },
    agentId: { type: "string", description: "The id off the agent that will connect", format: "uuid" },
  },
  required: ["instance"],
  additionalProperties: false,
};

export const WhatsappConnectInstanceSchemaJson = {
  type: "object",
  properties: {
    instance: { type: "string", description: "The name of the instance to connect." },
  },
  required: ["instance"],
  additionalProperties: false,
};

export const WhatsappConnectSuccessResponseSchemaJson = {
  type: "object",
  properties: {
    data: {
      type: "object",
      properties: {
        pairingCode: { type: "string" },
        code: { type: "string" },
        count: { type: "number" },
      },
      required: ["pairingCode", "code", "count"],
    }
  },
  required: ["data"],
};

export const WhatsappCheckConnectionResponseSchemaJson = {
  type: "object",
  properties: {
    isConnected: { type: "boolean" },
  },
  required: ["isConnected"],
};

export const WhatsappErrorResponseSchemaJson = {
  type: "object",
  properties: {
    error: { type: "string" },
  },
  required: ["error"],
};