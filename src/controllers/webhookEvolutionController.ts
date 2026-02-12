import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { EvolutionApiService } from "../services/evolutionApiService.ts";
import { LangchainService } from "../services/langchainService.ts";
import { ID } from "../shared/types.ts";
import { supabase } from "../db/supabaseClient.ts";
import { getRedisClient } from "../db/redisClient.ts";
import { RedisConversationMemory } from "../services/conversationMemoryService.ts";
import { WebMessage } from "../models/enteties/message.ts";
import { CachedAgentRepository } from "../repository/cachedAgentRepository.ts";
import { AgentRespositoryImpl } from "../repository/agentRepository.ts";

const TIMEOUT_SECONDS = 12;
const FROM_ME_WINDOW_MINUTES = 120;
const TIME_PER_CHAR = 15;

export const webhookController = async (app: FastifyInstance) => {
  const repository = new CachedAgentRepository(new AgentRespositoryImpl(supabase));
  const memoryService = new RedisConversationMemory();

  app.post("/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id: agentId } = request.params as { id: string };
    const body = request.body as any;

    try {
      // 1. Normalization
      const whatsapp = {
        instance: body.instance || body.instanceName,
        remoteJid: body.data?.key?.remoteJid,
        sender: body.data?.key?.participant || body.data?.key?.remoteJid,
        fromMe: body.data?.key?.fromMe || false,
        messageType: body.data?.messageType,
        message: body.data?.message,
        base64: body.data?.message?.base64 || body.data?.base64
      };

      if (!whatsapp.remoteJid) return reply.status(200).send({ ok: true });

      // 2. Filters
      // 2.1 Ignore Groups
      if (whatsapp.remoteJid.endsWith("@g.us")) {
        return reply.status(200).send({ message: "Ignore group" });
      }

      const redis = getRedisClient();
      const fromMeLockKey = `Timeout-IUser.${whatsapp.remoteJid}.${whatsapp.sender}`;

      // 2.2 fromMe Window logic
      if (whatsapp.fromMe) {
        await redis.set(fromMeLockKey, FROM_ME_WINDOW_MINUTES.toString(), {
          EX: FROM_ME_WINDOW_MINUTES * 60
        });
        return reply.status(200).send({ message: "fromMe window set" });
      }

      // Check if IA response window is active (ignore user messages after IA replied for a while)
      const hasFromMeLock = await redis.get(fromMeLockKey);
      if (hasFromMeLock) {
        return reply.status(200).send({ message: "In fromMe window, ignoring user" });
      }

      // 3. Process Message type
      let content = "";
      const msg = whatsapp.message;
      const langchainService = new LangchainService();

      if (whatsapp.messageType === "conversation") {
        content = msg.conversation;
      } else if (whatsapp.messageType === "extendedTextMessage") {
        const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage?.conversation;
        const text = msg.extendedTextMessage?.text;
        content = quoted ? `Menção: ${quoted}\nResposta: ${text}` : text;
      } else if (whatsapp.messageType === "editedMessage") {
        content = msg.editedMessage?.message?.protocolMessage?.editedMessage?.conversation;
      } else if (whatsapp.messageType === "audioMessage" && whatsapp.base64) {
        content = await langchainService.transcribeAudio(whatsapp.base64);
      } else if (whatsapp.messageType === "imageMessage" && whatsapp.base64) {
        content = await langchainService.analyzeImage(whatsapp.base64);
      }

      if (!content) return reply.status(200).send({ ok: true });

      // 4. Grouping Mechanism (Redis Buffer)
      const bufferKey = `Messages.${whatsapp.remoteJid}`;
      const timeoutKey = `Timeout.${whatsapp.remoteJid}`;

      await redis.rPush(bufferKey, content);

      const newTimeout = Date.now() + (TIMEOUT_SECONDS * 1000);
      await redis.set(timeoutKey, newTimeout.toString(), { EX: 60 });

      // Wait for TIMEOUT
      await new Promise(resolve => setTimeout(resolve, TIMEOUT_SECONDS * 1000));

      // Re-verify if this is the last message of the sequence
      const savedTimeout = await redis.get(timeoutKey);
      const now = Date.now();
      console.log(`[Webhook] Timeout check: saved=${savedTimeout}, now=${now}`);

      if (savedTimeout && parseInt(savedTimeout) > now) {
        console.log("[Webhook] Gathering more messages (returning early)");
        return reply.status(200).send({ message: "Gathering more messages..." });
      }

      // 5. Finalize grouping and process
      const groupedMessages = await redis.lRange(bufferKey, 0, -1);
      console.log(`[Webhook] Grouped messages: ${groupedMessages?.length || 0}`);

      await redis.del(bufferKey);
      await redis.del(timeoutKey);

      if (!groupedMessages || groupedMessages.length === 0) {
        console.log("[Webhook] No messages in buffer, returning");
        return reply.status(200).send({ ok: true });
      }

      const fullMessage = groupedMessages.join("\n");

      // 6. Execute Agent
      const agent = await repository.findById(ID.from(agentId));
      console.log(`[Webhook] Agent status: ${agent?.status}`);

      if (!agent || (agent.status?.toLowerCase() === "inactive")) {
        console.log("[Webhook] Agent inactive or not found");
        return reply.status(200).send({ message: "Agent not found or inactive" });
      }

      const conversationId = memoryService.generateConversationId(agent.id, whatsapp.remoteJid);
      const history = await memoryService.getHistory(conversationId);

      const aiResponse = await langchainService.executeAgent({
        agent,
        messageHistory: history,
        message: fullMessage,
        whatsappContext: {
          instanceName: whatsapp.instance,
          remoteJid: whatsapp.remoteJid,
          sender: whatsapp.sender
        }
      });

      console.log(`[Webhook] AI Response for ${whatsapp.remoteJid}: "${aiResponse}"`);

      // 7. Save to History
      await memoryService.addMessage(conversationId, {
        id: new ID(`msg-${Date.now()}-user`),
        content: fullMessage,
        fromMe: false,
        conversationId: agent.id
      });
      await memoryService.addMessage(conversationId, {
        id: new ID(`msg-${Date.now()}-ai`),
        content: aiResponse,
        fromMe: true,
        conversationId: agent.id
      });

      // 8. Delivery
      const envKey = Deno.env.get("EVOLUTION_API_KEY");
      const envUrl = Deno.env.get("EVOLUTION_API_URL");

      if (!envKey || !envUrl) {
        console.error("[Webhook] Missing Evolution API credentials");
        return reply.status(200).send({ error: "Missing API credentials" });
      }

      const evoService = new EvolutionApiService({
        apiKey: envKey,
        url: envUrl
      });

      const responseSegments = aiResponse.split("\n\n").filter(s => s.trim() !== "");
      console.log(`[Webhook] Sending ${responseSegments.length} segments to ${whatsapp.instance}`);

      for (const segment of responseSegments) {
        const delay = segment.length * TIME_PER_CHAR;
        console.log(`[Webhook] Segment delay: ${delay}ms`);
        // Wait for simulated typing
        await new Promise(resolve => setTimeout(resolve, delay));

        const sendResult = await evoService.sendMessage({
          instance: whatsapp.instance,
          number: whatsapp.remoteJid,
          message: segment,
          presence: "composing",
          delay: 0
        });
        console.log(`[Webhook] Send result:`, sendResult);
      }

      return reply.status(200).send({ success: true });

    } catch (err) {
      app.log.error(err, "Error in webhook process");
      return reply.status(500).send({ error: (err as Error).message });
    }
  });
};
