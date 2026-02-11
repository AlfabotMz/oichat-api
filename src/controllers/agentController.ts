import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { LangchainService } from "../services/langchainService.ts";
import { AgentSchema, CreateAgent, CreateAgentSchema, UpdateAgent, UpdateAgentSchema } from "../models/enteties/agent.ts";
import { ID } from "../shared/types.ts";
import { WebMessage, WebMessageSchema } from "../models/enteties/message.ts";
import z from "zod/v4";
import { supabase } from "../db/supabaseClient.ts";
import { CachedAgentRepository } from "../repository/cachedAgentRepository.ts";
import { AgentRespositoryImpl } from "../repository/agentRepository.ts";
import { RedisConversationMemory } from "../services/conversationMemoryService.ts";
import { EvolutionApiService } from "../services/evolutionApiService.ts";
import { AnalyticsRepositoryImpl } from "../repository/analyticsRepository.ts";
import "@std/dotenv";




// Inferência automática dos tipos
type ConversationBody = Omit<WebMessage, 'fromMe' | 'id'>;
type ConversationParams = { id: string };
type ConversationRequest = {
  Body: ConversationBody;
  Params: ConversationParams;
};


type AgentGetParams = { id: string };
type AgentGetRequest = {
  Params: AgentGetParams;
};

type AgentPostBody = CreateAgent;
type AgentPostRequest = {
  Body: AgentPostBody;
};

type AgentPatchBody = Partial<UpdateAgent>;
type AgentPatchRequest = {
  Body: AgentPatchBody;
  Params: AgentGetParams;
}

type AgentDeleteRequest = {
  Params: AgentGetParams;
}

type ConversationDeleteParams = { id: string; conversationId: string };
type ConversationDeleteRequest = {
  Params: ConversationDeleteParams;
};


const paramSchema = z.object({
  id: z.uuid("ID de agente inválido"),
});

const conversationDeleteParamSchema = z.object({
  id: z.uuid("ID de agente inválido"),
  conversationId: z.string().min(1, "ID de conversa inválido"),
});

import {
  AgentSchemaJson,
  CreateAgentSchemaJson,
  ErrorResponseSchemaJson,
  UpdateAgentSchemaJson,
  WebMessageSchemaJson,

  WhatsappConnectSuccessResponseSchemaJson,
  WhatsappCheckConnectionResponseSchemaJson,
} from "../jsonSchemaSwagger.ts";

const repository = new CachedAgentRepository(new AgentRespositoryImpl(supabase))
const analyticsRepository = new AnalyticsRepositoryImpl(supabase)
const memoryService = new RedisConversationMemory()

export const agentController = async (app: FastifyInstance) => {

  // n8n compatible endpoint
  app.post("/create-agent", {
    schema: {
      summary: 'Criar um novo agente (n8n compatível)',
      tags: ['Agente'],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;

    // Mapping n8n body to internal CreateAgent
    const agentData: CreateAgent = {
      userId: ID.from(body.user_id),
      name: body.nome,
      prompt: body.prompt,
      phoneNumber: body.phone_number,
      status: "inactive" // Set as inactive per the example response
    };

    try {
      // 1. Create Agent
      const agent = await repository.create(agentData);

      // 2. Create Analytics Row
      try {
        await analyticsRepository.create({
          agentId: agent.id,
          totalMessages: 0,
          totalConversations: 0,
          conversions: 0
        });
      } catch (analyticsError) {
        app.log.error(analyticsError, `Error creating analytics for agent ${agent.id}`);
      }

      // 3. Initialize Evolution API Instance
      const evoService = new EvolutionApiService({
        apiKey: Deno.env.get("EVOLUTION_API_KEY")!,
        url: Deno.env.get("EVOLUTION_API_URL")!
      });

      try {
        await evoService.createInstace({
          name: agent.id.toString(), // Using ID as instance name
          id: agent.id
        });
      } catch (evoError) {
        app.log.error(evoError, `Error creating Evolution instance for agent ${agent.id}`);
      }

      // Map response to n8n format (array)
      const response = [
        {
          success: true,
          message: "Agente criado com sucesso!",
          agent: {
            agent_id: agent.id.toString()
          },
          nome: agent.name,
          prompt: agent.prompt,
          status: agent.status
        }
      ];

      reply.status(200).send(response);
    } catch (error) {
      reply.status(500).send({
        success: false,
        message: `Erro ao criar agente: ${error}`
      });
    }
  });

  // n8n compatible delete endpoint
  app.post("/delete-agent", {
    schema: {
      summary: 'Deletar um agente (n8n compatível)',
      tags: ['Agente'],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    const agentIdStr = body.agent_id;

    if (!agentIdStr) {
      return reply.status(400).send({
        success: false,
        message: "ID do agente não fornecido"
      });
    }

    try {
      const agentId = ID.from(agentIdStr);

      // 1. Verificar se o agente existe
      const agent = await repository.findById(agentId);
      if (!agent) {
        return reply.status(404).send({
          success: false,
          message: "Agente não encontrado"
        });
      }

      // 2. Deletar instância na Evolution API (se existir)
      // O nome da instância é o mesmo que o ID do agente ou o instanceName salvo
      const instanceToDelete = agent.instanceName;
      const evoService = new EvolutionApiService({
        apiKey: Deno.env.get("EVOLUTION_API_KEY")!,
        url: Deno.env.get("EVOLUTION_API_URL")!
      });

      try {
        await evoService.deleteInstance(instanceToDelete);
      } catch (evoError) {
        app.log.warn(evoError, `Erro ao deletar instância ${instanceToDelete} na Evolution API`);
        // Prosseguir mesmo se a instância não existir ou falhar
      }

      // 3. Deletar Analytics
      try {
        await analyticsRepository.deleteByAgentId(agent.id);
      } catch (analyticsError) {
        app.log.warn(analyticsError, `Erro ao deletar analytics para o agente ${agent.id}`);
      }

      // 4. Deletar Agente no Banco
      await repository.delete(agent.id);

      reply.status(200).send({
        success: true,
        message: "Agente e recursos associados deletados com sucesso"
      });
    } catch (error) {
      app.log.error(error, `Erro ao deletar agente ${agentIdStr}`);
      reply.status(500).send({
        success: false,
        message: `Erro ao deletar agente: ${error}`
      });
    }
  });
  app.get<AgentGetRequest>("/:id", {
    schema: {
      summary: 'Obter um agente pelo ID',
      description: 'Busca um único agente no banco de dados ou cache.',
      tags: ['Agente'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      response: {
        200: { schema: AgentSchemaJson },
        404: { schema: ErrorResponseSchemaJson },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsedParams = paramSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        params: !parsedParams.success ? z.treeifyError(parsedParams.error) : undefined
      })
    }

    const { id } = parsedParams.data

    console.log(id)
    const agent = await repository.findById(ID.from(id))
    console.log(agent)
    if (!agent) {
      reply.status(404).send({ error: "Agent not found" });
      return
    }

    reply.status(200).send(agent);
  });

  app.patch<AgentPatchRequest>("/:id", {
    schema: {
      summary: 'Atualizar um agente existente',
      description: 'Atualiza uma ou mais propriedades de um agente.',
      tags: ['Agente'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: UpdateAgentSchemaJson,
      response: {
        200: AgentSchemaJson,
        400: ErrorResponseSchemaJson,
        404: ErrorResponseSchemaJson,
      },
    },
  }, async (request, reply) => {
    const parsedParams = paramSchema.safeParse(request.params);
    const parsedBody = UpdateAgentSchema.safeParse(request.body);

    if (!parsedParams.success || !parsedBody.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        params: !parsedParams.success ? z.treeifyError(parsedParams.error) : undefined,
        body: !parsedBody.success ? z.treeifyError(parsedBody.error) : undefined,
      });
    }

    if (Object.keys(parsedBody.data).length === 0) {
      return reply.status(400).send({ error: "The requisition body is empty" });
    }

    const { id } = parsedParams.data;
    const updateData = parsedBody.data;

    try {
      const updatedAgent = await repository.update(ID.from(id), updateData);
      if (!updatedAgent) {
        // This case might be handled by the repository throwing an error, but it's good practice.
        return reply.status(404).send({ error: "Agent not found" });
      }
      reply.status(200).send(updatedAgent);
    } catch (error) {
      // Assuming the repository throws an error for not found, we could check the message.
      reply.status(500).send({ error: `Agent not updated error: ${error}` });
    }
  });

  app.delete<AgentDeleteRequest>("/:id/delete", {
    schema: {
      summary: 'Excluir um agente',
      description: 'Exclui permanentemente um agente e invalida seu cache.',
      tags: ['Agente'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      response: {
        204: { description: "Agent deleted successfully", type: "null" },
        404: ErrorResponseSchemaJson,
      },
    },
  }, async (request, reply) => {
    const parsedParams = paramSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({
        error: "ID de parâmetro inválido",
        details: z.treeifyError(parsedParams.error),
      });
    }

    const { id } = parsedParams.data;

    try {
      await repository.delete(ID.from(id));
      reply.status(204).send(); // 204 No Content é o padrão para DELETE bem-sucedido
    } catch (error) {
      const errorMessage = (error as Error).message;
      const statusCode = errorMessage.includes("not found") ? 404 : 500;
      reply.status(statusCode).send({ error: `Agent not deleted: ${errorMessage}` });
    }
  });

  app.delete<ConversationDeleteRequest>(
    "/conversation/:id/:conversationId", {
    schema: {
      summary: 'Limpar histórico da conversa',
      description: 'Exclui todo o histórico de mensagens de uma conversa específica do Redis.',
      tags: ['Conversa'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'The agent ID' },
          conversationId: { type: 'string', description: 'The unique ID for the conversation (e.g., a user JID)' },
        },
      },
      response: {
        200: { type: 'object', properties: { message: { type: 'string' } } },
      },
    },
  },
    async (request, reply) => {
      const parsedParams = conversationDeleteParamSchema.safeParse(request.params);

      if (!parsedParams.success) {
        return reply.status(400).send({
          error: "Parâmetros inválidos",
          details: z.treeifyError(parsedParams.error),
        });
      }

      const { id: agentId, conversationId } = parsedParams.data;

      try {
        // Opcional: verificar se o agente existe para retornar um 404 mais preciso.
        const agent = await repository.findById(ID.from(agentId));
        if (!agent) {
          return reply.status(404).send({ error: "Agent not found" });
        }

        const redisConversationId = memoryService.generateConversationId(agent.id, conversationId);
        await memoryService.clearHistory(redisConversationId);

        reply.status(200).send({ message: "Histórico da conversa limpo com sucesso." });
      } catch (error) {
        const errorMessage = (error as Error).message;
        app.log.error(error, `Error clearing history for agent ${agentId}, conversation ${conversationId}`);
        reply.status(500).send({ error: `Ocorreu um erro ao limpar o histórico: ${errorMessage}` });
      }
    }
  );

  app.post<ConversationRequest>(
    "/conversation/:id", {
    schema: {
      summary: 'Interagir com um agente',
      description: 'Envia uma mensagem para um agente e recebe uma resposta gerada por IA. O histórico da conversa é usado para contexto.',
      tags: ['Conversa'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'The agent ID' },
        },
      },
      body: WebMessageSchemaJson,
      response: {
        200: WebMessageSchemaJson,
        400: ErrorResponseSchemaJson,
      },
    },
  }, async (request, reply) => {
    const parsedParams = paramSchema.safeParse(request.params);
    const parsedBody = WebMessageSchema.safeParse(request.body);

    if (!parsedParams.success || !parsedBody.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        params: !parsedParams.success ? z.treeifyError(parsedParams.error) : undefined,
        body: !parsedBody.success ? z.treeifyError(parsedBody.error) : undefined
      })
    }

    const { id: agentId } = parsedParams.data;
    const userMessageData = parsedBody.data;

    try {
      const agent = await repository.findById(ID.from(agentId));
      if (!agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      // 1. Preparar para o armazenamento de memória
      const redisConversationId = memoryService.generateConversationId(agent.id, userMessageData.conversationId.toString());
      const messageHistory = await memoryService.getHistory(redisConversationId);

      // 2. Executar o agente com o histórico
      const langchainService = new LangchainService();
      const agentResponseContent = await langchainService.executeAgent({
        agent: agent,
        messageHistory: messageHistory,
        message: userMessageData.content
      });

      // 3. Criar objetos de mensagem para armazenamento
      const userMessage: WebMessage = { ...userMessageData, fromMe: false };
      const aiMessage: WebMessage = {
        id: new ID(`msg-${Date.now()}-ai`),
        content: agentResponseContent,
        fromMe: true,
        conversationId: userMessageData.conversationId,
      };

      // 4. Armazenar ambas as mensagens no histórico da conversa
      await memoryService.addMessage(redisConversationId, userMessage);
      await memoryService.addMessage(redisConversationId, aiMessage);

      // 5. Enviar a resposta da IA de volta ao cliente
      reply.status(200).send(aiMessage);
    } catch (error) {
      const errorMessage = (error as Error).message;
      app.log.error(error, `Error in conversation for agent ${agentId}`);
      reply.status(500).send({ error: `An error occurred: ${errorMessage}` });
    }
  }
  );


  // --- WhatsApp Endpoints (Migrated) ---

  const connectInstanceValidationSchema = z.object({ agent_id: z.string().min(1) });
  type ConnectInstanceBody = { agent_id: string };

  app.post("/connect-whatsapp", {
    schema: {
      summary: "Connect agent to WhatsApp (n8n compatible)",
      tags: ["Agent"],
    },
  }, async (request, reply) => {
    const body = request.body as any;
    const { agent_id } = body;

    if (!agent_id) {
      return reply.status(400).send({ success: false, message: "ID do agente não fornecido" });
    }

    try {
      // 1. Get Agent
      const agent = await repository.findById(ID.from(agent_id));
      if (!agent) {
        return reply.status(404).send({ success: false, message: "Agente não encontrado" });
      }

      const instanceName = agent.instanceName || agent.id.toString();
      const evoService = new EvolutionApiService({
        apiKey: Deno.env.get("EVOLUTION_API_KEY")!,
        url: Deno.env.get("EVOLUTION_API_URL")!
      });

      // 2. Check Instance State
      let connectionState;
      try {
        connectionState = await evoService.checkInstanceState(instanceName);
      } catch (e) {
        app.log.warn(`Instance ${instanceName} might not exist yet: ${e}`);
        // If it doesn't exist, create it
        try {
          await evoService.createInstace({ name: instanceName, id: agent.id });
        } catch (createErr) {
          return reply.status(500).send({ success: false, message: `Erro ao criar instância: ${createErr}` });
        }
      }

      // 3. If connected, disconnect (logout)
      if (connectionState?.instance?.state === "open") {
        try {
          await evoService.logoutInstance(instanceName);
        } catch (logoutErr) {
          app.log.warn(`Erro ao desconectar instância ${instanceName}: ${logoutErr}`);
        }
      }

      // 4. Connect and get QR Code
      try {
        const connectData = await evoService.connectInstaceWithCode(instanceName);

        reply.status(200).send({
          success: true,
          qr: connectData.base64 || connectData.code, // Evolution returns base64 for QR image
          status: "pending",
          message: "Escaneie o QR code para conectar seu número de WhatsApp."
        });
      } catch (connectErr) {
        reply.status(500).send({ success: false, message: `Erro ao gerar QR code: ${connectErr}` });
      }

    } catch (error) {
      app.log.error(error, "Error in connect-whatsapp flow");
      reply.status(500).send({
        success: false,
        message: `Erro interno: ${error}`
      });
    }
  });

  // n8n compatible check-status endpoint
  app.post("/check-status", {
    schema: {
      summary: "Check agent connection status (n8n compatible)",
      tags: ["Agent"],
    },
  }, async (request, reply) => {
    const body = request.body as any;
    const { agent_id } = body;

    if (!agent_id) {
      return reply.status(400).send([{ success: false, message: "ID do agente não fornecido" }]);
    }

    try {
      // 1. Get Agent from Supabase
      const agent = await repository.findById(ID.from(agent_id));
      if (!agent) {
        return reply.status(404).send([{ success: false, message: "Agente não encontrado" }]);
      }

      const instanceName = agent.instanceName || agent.id.toString();
      const evoService = new EvolutionApiService({
        apiKey: Deno.env.get("EVOLUTION_API_KEY")!,
        url: Deno.env.get("EVOLUTION_API_URL")!
      });

      // 2. Check Instance State in Evolution API
      let connectionState;
      try {
        connectionState = await evoService.checkInstanceState(instanceName);
      } catch (e) {
        return reply.status(200).send([
          {
            success: true,
            agent_id: agent_id,
            status: "disconnected"
          }
        ]);
      }

      const isConnected = connectionState?.instance?.state === "open";

      if (isConnected) {
        // 3. Fetch Instance details to get the connected number
        let phone = "";
        try {
          const instances = await evoService.fetchInstance(instanceName);
          const instanceData = Array.isArray(instances)
            ? instances.find((i: any) => i.instanceName === instanceName)
            : instances;

          const rawJid = instanceData?.owner || instanceData?.instance?.owner;
          if (rawJid) {
            phone = rawJid.split('@')[0];

            // 4. Update Agent in DB
            await repository.update(agent.id, {
              phoneNumber: phone,
              status: "active"
            });
          }
        } catch (fetchErr) {
          app.log.warn(`Erro ao buscar detalhes da instância ou atualizar DB: ${fetchErr}`);
        }

        return reply.status(200).send([
          {
            success: true,
            agent_id: agent_id,
            status: "connected",
            number: phone || agent.phoneNumber
          }
        ]);
      } else {
        return reply.status(200).send([
          {
            success: true,
            agent_id: agent_id,
            status: "disconnected"
          }
        ]);
      }

    } catch (error) {
      app.log.error(error, "Error in check-status flow");
      reply.status(500).send([{
        success: false,
        message: `Erro interno: ${error}`
      }]);
    }
  });

  app.get<{ Params: { id: string } }>("/:id/status", {
    schema: {
      summary: "Check agent connection status",
      tags: ["Agent"],
      params: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
      response: {
        200: WhatsappCheckConnectionResponseSchemaJson,
        500: ErrorResponseSchemaJson,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const instanceName = id; // Using ID as instance name

    const evoService = new EvolutionApiService({ apiKey: Deno.env.get("EVOLUTION_API_KEY")!, url: Deno.env.get("EVOLUTION_API_URL")! });
    try {
      const connectionState = await evoService.checkInstanceState(instanceName);
      const isConnected = connectionState?.instance?.state === "open";

      // Map to contract response
      const status = isConnected ? "connected" : "disconnected";

      reply.status(200).send({
        success: true,
        status: status,
        connected: isConnected,
        message: isConnected ? "Agent connected" : "Agent disconnected"
      });
    } catch (error) {
      app.log.error(error, `Error checking status for ${id}`);
      reply.status(200).send({ // Contract says error response status might be 400/500 but also structure
        success: false,
        status: "disconnected",
        connected: false,
        error: `Error checking status: ${error}`
      });
    }
  });
};
