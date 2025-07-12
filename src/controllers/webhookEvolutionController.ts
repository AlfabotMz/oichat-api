import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { EvolutionApiService } from "../services/evolutionApiService.ts";
import { LangchainService } from "../services/langchainService.ts";
import { ID } from "../shared/types.ts";
import "@std/dotenv";
import { supabase } from "../db/supabaseClient.ts";
import z from "zod/v4";
import { CachedAgentRepository } from "../repository/cachedAgentRepository.ts";
import { AgentRespositoryImpl } from "../repository/agentRepository.ts";
import { RedisConversationMemory } from "../services/conversationMemoryService.ts";
import { WebMessage } from "../models/enteties/message.ts";

// Schema para validar o ID do agente na URL
const paramSchema = z.object({
  id: z.string().uuid("ID de agente inválido na URL."),
});

// Schema para validar o corpo do webhook da Evolution API
const webhookBodySchema = z.object({
  instance: z.string(),
  data: z.object({
    // O objeto message pode não existir em todos os eventos
    message: z.object({
      // A conversa pode ser nula (ex: em mensagens de imagem)
      conversation: z.string().nullable().optional(),
    }).nullable().optional(),
    key: z.object({
      remoteJid: z.string(),
      fromMe: z.boolean(),
    }),  
  }),
});

export const webhookController = async (app: FastifyInstance) => {
  const repository = new CachedAgentRepository(new AgentRespositoryImpl(supabase));
  const memoryService = new RedisConversationMemory();

  app.post("/:id", async (request: FastifyRequest, reply: FastifyReply) => {

    // 1. Validar parâmetros da URL e corpo da requisição
    const parsedParams = paramSchema.safeParse(request.params);
    const parsedBody = webhookBodySchema.safeParse(request.body);

    if (!parsedParams.success || !parsedBody.success) {
      return reply.status(400).send({
        error: "Dados do webhook inválidos",
        params: !parsedParams.success ? z.treeifyError(parsedParams.error) : undefined,
        body: !parsedBody.success ? z.treeifyError(parsedBody.error) : undefined,
      });
    }

    // 2. Extrair dados validados
    const { id: agentId } = parsedParams.data;
    const { instance, data } = parsedBody.data;
    const { message, key } = data;

    // Apenas processar mensagens de texto recebidas
    const messageContent = message?.conversation;
    if (key.fromMe || !messageContent) {
      return reply.status(200).send({ message: "Mensagem ignorada (própria ou sem conteúdo de texto)." });
    }
    try {
      // 3. Buscar o agente no banco de dados
      const agent = await repository.findById(ID.from(agentId));

      if (!agent) {
        app.log.warn(`Webhook recebido para um agente que não existe: ${agentId}`);
        return reply.status(404).send({ error: "Agente não encontrado" });
      }

      if (agent.status === 'INACTIVE') {
        app.log.info(`Webhook recebido para um agente inativo: ${agentId}`);
        return reply.status(200).send({ message: "Agente está inativo." });
      }

      // 4. Preparar e executar os serviços
      const conversationId = memoryService.generateConversationId(agent.id, key.remoteJid);
      const messageHistory = await memoryService.getHistory(conversationId);

      const langchainService = new LangchainService();
      const agentMessage = await langchainService.executeAgent({ agent, messageHistory, message: messageContent });

      // 5. Salvar a interação na memória
      const userMessage: WebMessage = {
        id: new ID(`msg-${Date.now()}-user`),
        content: messageContent,
        fromMe: false,
        conversationId: agent.id, // Usando ID do agente como ID da conversa
      };
      const aiMessage: WebMessage = {
        id: new ID(`msg-${Date.now()}-ai`),
        content: agentMessage,
        fromMe: true,
        conversationId: agent.id,
      };
      await memoryService.addMessage(conversationId, userMessage);
      await memoryService.addMessage(conversationId, aiMessage);

      const evoService = new EvolutionApiService({ apiKey: Deno.env.get("EVOLUTION_API_KEY")!, url: Deno.env.get("EVOLUTION_API_URL")! });

      await evoService.sendMessage({ instance, message: JSON.stringify(agentMessage), number: key.remoteJid });

      reply.status(200).send({ success: true });
    } catch (error) {
      const errorMessage = (error as Error).message;
      app.log.error(error, `Erro ao processar webhook para o agente ${agentId}`);
      reply.status(500).send({ error: `Ocorreu um erro: ${errorMessage}` });
    }
  });
};