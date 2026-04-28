import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { WhatsappCloudApiService } from "../services/whatsappCloudApiService.ts";
import { LangchainService } from "../services/langchainService.ts";
import { ID } from "../shared/types.ts";
import { supabase } from "../db/supabaseClient.ts";
import { getRedisClient } from "../db/redisClient.ts";
import { RedisConversationMemory } from "../services/conversationMemoryService.ts";
import { CachedAgentRepository } from "../repository/cachedAgentRepository.ts";
import { AgentRespositoryImpl } from "../repository/agentRepository.ts";

const TIMEOUT_SECONDS = 12;
const FROM_ME_WINDOW_MINUTES = 120;
const TIME_PER_CHAR = 15;

export const webhookWhatsappCloudController = async (app: FastifyInstance) => {
    const repository = new CachedAgentRepository(new AgentRespositoryImpl(supabase));
    const memoryService = new RedisConversationMemory();

    // Verification from Meta
    app.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
        const query = request.query as any;
        const mode = query['hub.mode'];
        const token = query['hub.verify_token'];
        const challenge = query['hub.challenge'];

        const verifyToken = Deno.env.get("WHATSAPP_CLOUD_VERIFY_TOKEN");

        if (mode && token) {
            if (mode === 'subscribe' && token === verifyToken) {
                app.log.info('[WhatsApp Cloud Webhook] Webhook verified successfully!');
                return reply.status(200).send(challenge);
            } else {
                return reply.status(403).send("Forbidden");
            }
        }

        return reply.status(400).send("Bad Request");
    });

    // Incoming Messages
    app.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as any;

        try {
            if (!body.entry || !body.entry[0].changes || !body.entry[0].changes[0].value) {
                return reply.status(200).send({ ok: true }); // Acknowledge non-message events
            }

            const value = body.entry[0].changes[0].value;
            const phoneNumberId = value.metadata?.phone_number_id;

            // Ensure it's a message event
            if (!value.messages || !value.messages[0]) {
                return reply.status(200).send({ ok: true });
            }

            const msg = value.messages[0];
            const from = msg.from; // Sender number
            const messageType = msg.type;

            const whatsapp = {
                remoteJid: from,
                sender: from,
                messageType: messageType,
                text: msg.text?.body,
                fromMe: false // WhatsApp Cloud API sends statuses for fromMe messages, so usually the POST body.messages are not fromMe
            };

            if (!whatsapp.remoteJid) return reply.status(200).send({ ok: true });

            const redis = getRedisClient();
            const fromMeLockKey = `Timeout-IUser.${whatsapp.remoteJid}.${whatsapp.sender}`;

            // Check if IA response window is active
            const hasFromMeLock = await redis.get(fromMeLockKey);
            if (hasFromMeLock) {
                return reply.status(200).send({ message: "In fromMe window, ignoring user" });
            }

            // Find agent based on phoneNumberId
            const { data: agents, error } = await supabase
                .from("agents")
                .select("*")
                .eq("waba_phone_number_id", phoneNumberId);

            if (error || !agents || agents.length === 0) {
                app.log.warn(`[WhatsApp Cloud Webhook] Agent not found for phone_number_id: ${phoneNumberId}`);
                return reply.status(200).send({ message: "Agent not found" });
            }

            const agentData = agents[0];

            // Need to find agent through the repository structure
            const agent = await repository.findById(ID.from(agentData.id));

            if (!agent || (agent.status?.toLowerCase() === "inactive")) {
                console.log("[WhatsApp Cloud Webhook] Agent inactive or not found");
                return reply.status(200).send({ message: "Agent not found or inactive" });
            }

            if (!agentData.waba_access_token) {
                app.log.error(`[WhatsApp Cloud Webhook] Agent found but missing waba_access_token`);
                return reply.status(200).send({ message: "Missing token" });
            }

            let content = "";
            const langchainService = new LangchainService();

            if (whatsapp.messageType === "text") {
                content = whatsapp.text;
            }
            // Note: WhatsApp Cloud handles media differently by providing media IDs that require secondary fetch.
            // We will skip media implementation for now as it requires fetching the URL and then downloading with the token.

            if (!content) return reply.status(200).send({ ok: true });

            // Grouping Mechanism (Redis Buffer)
            const bufferKey = `Messages-Cloud.${whatsapp.remoteJid}`;
            const timeoutKey = `Timeout-Cloud.${whatsapp.remoteJid}`;

            await redis.rPush(bufferKey, content);

            const newTimeout = Date.now() + (TIMEOUT_SECONDS * 1000);
            await redis.set(timeoutKey, newTimeout.toString(), { EX: 60 });

            // Wait for TIMEOUT
            await new Promise(resolve => setTimeout(resolve, TIMEOUT_SECONDS * 1000));

            const savedTimeout = await redis.get(timeoutKey);
            const now = Date.now();

            if (savedTimeout && parseInt(savedTimeout) > now) {
                return reply.status(200).send({ message: "Gathering more messages..." });
            }

            // Finalize grouping 
            const groupedMessages = await redis.lRange(bufferKey, 0, -1);

            await redis.del(bufferKey);
            await redis.del(timeoutKey);

            if (!groupedMessages || groupedMessages.length === 0) {
                return reply.status(200).send({ ok: true });
            }

            const fullMessage = groupedMessages.join("\n");

            const conversationId = memoryService.generateConversationId(agent.id, whatsapp.remoteJid);
            const history = await memoryService.getHistory(conversationId);

            const aiResponse = await langchainService.executeAgent({
                agent,
                messageHistory: history,
                message: fullMessage,
                whatsappContext: {
                    instanceName: agent.id.toString(), // Pseudo instance
                    remoteJid: whatsapp.remoteJid,
                    sender: whatsapp.sender
                }
            });

            console.log(`[WhatsApp Cloud Webhook] AI Response for ${whatsapp.remoteJid}: "${aiResponse}"`);

            // Save to History
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

            const cloudService = new WhatsappCloudApiService({
                url: "https://graph.facebook.com/v22.0"
            });

            const responseSegments = aiResponse.split("\n\n").filter((s: string) => s.trim() !== "");

            for (const segment of responseSegments) {
                const delay = segment.length * TIME_PER_CHAR;
                await new Promise(resolve => setTimeout(resolve, delay));

                // Mark as typing
                /* Note: Marking as composing is harder in cloud api without extra template or API calls
                   Skipping composing for MVP payload */

                await cloudService.sendMessage({
                    phoneNumberId: phoneNumberId,
                    accessToken: agentData.waba_access_token,
                    number: whatsapp.remoteJid,
                    message: segment
                });
            }

            return reply.status(200).send({ success: true });

        } catch (err) {
            app.log.error(err, "Error in whatsapp cloud webhook process");
            return reply.status(500).send({ error: (err as Error).message });
        }
    });
};
