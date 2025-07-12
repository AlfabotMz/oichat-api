import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { LangchainService } from "../services/langchainService.ts";
import { AgentSchema, CreateAgent, CreateAgentSchema, UpdateAgent, UpdateAgentSchema } from "../models/enteties/agent.ts";
import { ID } from "../shared/types.ts";
import { WebMessage, WebMessageSchema } from "../models/enteties/message.ts";
import z from "zod/v4";
import { supabase } from "../db/supabaseClient.ts";
import { CachedAgentRepository } from "../repository/cachedAgentRepository.ts";
import { AgentRespositoryImpl } from "../repository/agentRepository.ts";
import { RedisConversationMemory } from "../services/conversationMemoryService.ts";;
 



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
} from "../jsonSchemaSwagger.ts";

const repository = new CachedAgentRepository(new AgentRespositoryImpl(supabase))
const memoryService = new RedisConversationMemory()
 
export const agentController = async (app: FastifyInstance) => {
  app.post<AgentPostRequest>("/", {
    schema: {
      summary: 'Create a new agent',
      tags: ['Agent'],
      body: CreateAgentSchemaJson,
      response: {
        200: AgentSchemaJson,
        400: ErrorResponseSchemaJson,
        500: ErrorResponseSchemaJson,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsedBody = CreateAgentSchema.safeParse(request.body);
     console.log(parsedBody)
    if (!parsedBody.success) {
        return reply.status(400).send({
        error: "Dados inválidos",
        details: z.treeifyError(parsedBody.error)
      })
    }
    
    const agentData = parsedBody.data;

    try {
      const agent = await repository.create(agentData)
      if (!agent) {
        reply.status(404).send({ error: "Agent not created" });
        return
      }
      reply.status(200).send(agent);
    } catch (error) {
      reply.status(500).send({ error: `Agent not created error: ${error}` });
    }

});
  app.get<AgentGetRequest>("/:id", {
    schema: {
      summary: 'Get an agent by its ID',
      description: 'Fetches a single agent from the database or cache.',
      tags: ['Agent'],
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
        params: !parsedParams.success ? z.treeifyError(parsedParams.error) : undefined})
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
      summary: 'Update an existing agent',
      description: 'Updates one or more properties of an agent.',
      tags: ['Agent'],
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

  app.delete<AgentDeleteRequest>(":id", {
    schema: {
      summary: 'Delete an agent',
      description: 'Permanently deletes an agent and invalidates its cache.',
      tags: ['Agent'],
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
        summary: 'Clear conversation history',
        description: 'Deletes the entire message history for a specific conversation from Redis.',
        tags: ['Conversation'],
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
        summary: 'Interact with an agent',
        description: 'Send a message to an agent and receive an AI-generated response. The conversation history is used for context.',
        tags: ['Conversation'],
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
            body: !parsedBody.success ? z.treeifyError(parsedBody.error) : undefined})
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
};
