import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { EvolutionApiService } from "../services/evolutionApiService.ts";
import { ID } from "../shared/types.ts";
import "@std/dotenv"
import z from "zod/v4";

import {
  WhatsappCheckConnectionResponseSchemaJson,
  WhatsappConnectInstanceSchemaJson,
  WhatsappConnectSuccessResponseSchemaJson,
  WhatsappCreateInstanceSchemaJson,
  WhatsappErrorResponseSchemaJson,
} from "../jsonSchemaSwagger.ts";

// --- Zod Schemas for Runtime Validation ---
const createInstanceValidationSchema = z.object({ instance: z.string().min(1), agentId: z.uuid() });
const connectInstanceValidationSchema = z.object({ instance: z.string().min(1) });
const checkInstanceStateValidationSchema = z.object({ instanceName: z.string().min(1) });

// --- Request/Reply Types ---
type CreateInstanceBody = {
  instance: string;
  agentId: string;
};

type ConnectInstanceBody = {
  instance: string;
};

type CheckInstanceStateParams = {
  instanceName: string;
};

export const whatsappController = async (app: FastifyInstance) => {
  // Rota para criar uma instância do WhatsApp
  app.post<{ Body: CreateInstanceBody }>("/create", {
    schema: {
      summary: "Create a WhatsApp instance",
      tags: ["Whatsapp"],
      body: WhatsappCreateInstanceSchemaJson,
      response: {
        200: { type: "object", properties: { ok: { type: "boolean" } } },
        400: WhatsappErrorResponseSchemaJson,
        500: WhatsappErrorResponseSchemaJson,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsedBody = createInstanceValidationSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "Dados inválidos", details: z.treeifyError(parsedBody.error) });
    }

    const { instance, agentId } = parsedBody.data;
    const evoService = new EvolutionApiService({ apiKey: Deno.env.get("EVOLUTION_API_KEY")!, url: Deno.env.get("EVOLUTION_API_URL")! });
    try {
      await evoService.createInstace({ name: instance, id: new ID(agentId) });
      reply.status(200).send({ ok: true });
    } catch (error) {
      app.log.error(error, "Erro ao criar instância do WhatsApp");
      reply.status(500).send({ error: `Ocorreu um erro ao criar a instância. Erro: ${error}` });
    }
  });

  // Rota para conectar uma instância do WhatsApp com um código
  app.post<{ Body: ConnectInstanceBody }>("/connect", {
    schema: {
      summary: "Connect a WhatsApp instance",
      description: "Gets a QR code or pairing code to connect an instance.",
      tags: ["Whatsapp"],
      body: WhatsappConnectInstanceSchemaJson,
      response: {
        200: WhatsappConnectSuccessResponseSchemaJson,
        500: WhatsappErrorResponseSchemaJson,
      }
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsedBody = connectInstanceValidationSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "Dados inválidos", details: z.treeifyError(parsedBody.error) });
    }

    const { instance } = parsedBody.data;
    const evoService = new EvolutionApiService({ apiKey: Deno.env.get("EVOLUTION_API_KEY")!, url: Deno.env.get("EVOLUTION_API_URL")! });
    try {
      const data = await evoService.connectInstaceWithCode(instance);
      reply.status(200).send({ data: data });
    } catch (error) {
      app.log.error(error, "Erro ao conectar instância do WhatsApp");
      reply.status(500).send({ error: `Ocorreu um erro ao conectar a instância. Erro: ${error}` });
    }
  });

  // Nova rota para verificar se uma instância está conectada
  app.get<{ Params: CheckInstanceStateParams }>("/check/:instanceName", {
    schema: {
      summary: "Check instance connection status",
      tags: ["Whatsapp"],
      params: {
        type: "object",
        properties: { instanceName: { type: "string" } },
        required: ["instanceName"],
      },
      response: {
        200: WhatsappCheckConnectionResponseSchemaJson,
        500: WhatsappErrorResponseSchemaJson,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsedParams = checkInstanceStateValidationSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "Dados inválidos", details: z.treeifyError(parsedParams.error) });
    }
    const instanceName = parsedParams.data.instanceName;
    const evoService = new EvolutionApiService({ apiKey: Deno.env.get("EVOLUTION_API_KEY")!, url: Deno.env.get("EVOLUTION_API_URL")! });
    try {
      const connectionState = await evoService.checkInstanceState(instanceName);
      const isConnected = connectionState?.instance?.state === "open";
      reply.status(200).send({ isConnected });
    } catch (error) {
      app.log.error(error, `Erro ao verificar conexão da instância ${instanceName}`);
      reply.status(500).send({ error: `Ocorreu um erro ao verificar a conexão da instância. Erro: ${error}` });
    }
  });
};