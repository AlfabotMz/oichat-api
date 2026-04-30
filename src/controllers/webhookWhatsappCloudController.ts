import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { WhatsappCloudApiService } from "../services/whatsappCloudApiService.ts";
import { LangchainService } from "../services/langchainService.ts";
import { ID } from "../shared/types.ts";
import { supabase } from "../db/supabaseClient.ts";
import { getRedisClient } from "../db/redisClient.ts";
import { RedisConversationMemory } from "../services/conversationMemoryService.ts";
import { CachedAgentRepository } from "../repository/cachedAgentRepository.ts";
import { AgentRespositoryImpl } from "../repository/agentRepository.ts";
import { createHmac } from "node:crypto";

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

    // Incoming Events
    app.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as any;

        try {
            if (!body.entry || !body.entry[0].changes || !body.entry[0].changes[0].value) {
                return reply.status(200).send({ ok: true }); // Acknowledge non-message events
            }

            const value = body.entry[0].changes[0].value;
            const field = body.entry[0].changes[0].field;

            // ---- Handle Account Update Webhook (Embedded Signup) ----
            if (field === "account_update") {
                const event = value.event;
                const wabaId = value.waba_id || body.entry[0].id; // Some payloads have waba_id in value

                app.log.info(`[WhatsApp Cloud Webhook] account_update received for WABA ${wabaId}, event: ${event}`);

                // "Somente para adicionar o lead/cliente na app do facebook após o evento"
                if (event === "PARTNER_ADDED") {
                    app.log.info(`[WhatsApp Cloud Webhook] Partner Added! Iniciando inscrição automática do app no WABA ${wabaId}`);

                    // Extração dos IDs necessários
                    const ownerBusinessId = value.owner_business_id || value.waba_info?.owner_business_id;

                    if (!ownerBusinessId) {
                        app.log.error("[WhatsApp Cloud Webhook] owner_business_id not found in webhook payload. Cannot proceed with automatic subscription.");
                        return reply.status(200).send({ ok: true });
                    }

                    const systemUserToken = Deno.env.get("SYSTEM_USER_TOKEN");
                    const appSecret = Deno.env.get("APP_SECRET");

                    if (!systemUserToken || !appSecret) {
                        app.log.error("[WhatsApp Cloud Webhook] Missing SYSTEM_USER_TOKEN or APP_SECRET in environment.");
                        return reply.status(200).send({ ok: true });
                    }

                    // Process async to avoid webhook timeout
                    (async () => {
                        try {
                            // Step 4: Generate appsecret_proof
                            const appsecretProof = createHmac('sha256', appSecret).update(systemUserToken).digest('hex');

                            // Step 5: Get Business Token 
                            // (Docs: POST /<BUSINESS_PORTFOLIO_ID>/system_user_access_tokens)
                            const tokenRes = await fetch(`https://graph.facebook.com/v21.0/${ownerBusinessId}/system_user_access_tokens`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${systemUserToken}`,
                                    'Content-Type': 'application/x-www-form-urlencoded'
                                },
                                body: new URLSearchParams({
                                    appsecret_proof: appsecretProof,
                                    fetch_only: 'true'
                                })
                            });

                            const tokenData = await tokenRes.json();
                            if (!tokenRes.ok || !tokenData.access_token) {
                                app.log.error(`[WhatsApp Cloud Webhook] Error fetching business token: ${JSON.stringify(tokenData)}`);
                                return;
                            }

                            const businessToken = tokenData.access_token;

                            // Step 2: Subscribe App to WABA
                            // Isso é o "adicionar o nosso aplicativo dentro do aplicativo"
                            const subscribeRes = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${businessToken}`,
                                    'Content-Type': 'application/json'
                                }
                            });

                            const subscribeData = await subscribeRes.json();
                            if (subscribeRes.ok) {
                                app.log.info(`[WhatsApp Cloud Webhook] App inscrito com sucesso na WABA ${wabaId}!`);
                            } else {
                                app.log.error(`[WhatsApp Cloud Webhook] Falha ao inscrever app na WABA: ${JSON.stringify(subscribeData)}`);
                            }

                        } catch (err) {
                            app.log.error(err, "[WhatsApp Cloud Webhook] Error during automated background subscription");
                        }
                    })();
                } else if (event === "VERIFIED_ACCOUNT" || event === "APPROVED") {
                    // Outros eventos ainda podem ativar o agente se ele já existir
                    const { data: agents } = await supabase
                        .from("agents")
                        .select("*")
                        .eq("waba_id", wabaId);

                    if (agents && agents.length > 0) {
                        for (const agent of agents) {
                            if (agent.status !== "active") {
                                await supabase.from("agents").update({ status: "active" }).eq("id", agent.id);
                                app.log.info(`[WhatsApp Cloud Webhook] Agent ${agent.id} ativado via event ${event}.`);
                            }
                        }
                    }
                }

                return reply.status(200).send({ ok: true });
            }

            // ---- Handle Normal Messages ----
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

            // Send OK to Meta immediately
            reply.status(200).send({ ok: true });

            // Process async
            (async () => {
                try {
                    const redis = getRedisClient();
                    const fromMeLockKey = `Timeout-IUser.${whatsapp.remoteJid}.${whatsapp.sender}`;

                    const hasFromMeLock = await redis.get(fromMeLockKey);
                    if (hasFromMeLock) {
                        app.log.info("[WhatsApp Cloud Webhook] In fromMe window, ignoring user");
                        return;
                    }

                    const { data: agents, error } = await supabase
                        .from("agents")
                        .select("*")
                        .eq("waba_phone_number_id", phoneNumberId);

                    if (error || !agents || agents.length === 0) {
                        app.log.warn(`[WhatsApp Cloud Webhook] Agent not found for phone_number_id: ${phoneNumberId}`);
                        return;
                    }

                    const agentData = agents[0];
                    const agent = await repository.findById(ID.from(agentData.id));

                    if (!agent || (agent.status?.toLowerCase() === "inactive")) {
                        app.log.info("[WhatsApp Cloud Webhook] Agent inactive or not found");
                        return;
                    }

                    if (!agentData.waba_access_token) {
                        app.log.error(`[WhatsApp Cloud Webhook] Agent found but missing waba_access_token`);
                        return;
                    }

                    let content = "";
                    const langchainService = new LangchainService();

                    if (whatsapp.messageType === "text") {
                        content = whatsapp.text;
                    }

                    if (!content) return;

                    const bufferKey = `Messages-Cloud.${whatsapp.remoteJid}`;
                    const timeoutKey = `Timeout-Cloud.${whatsapp.remoteJid}`;

                    await redis.rPush(bufferKey, content);

                    const newTimeout = Date.now() + (TIMEOUT_SECONDS * 1000);
                    await redis.set(timeoutKey, newTimeout.toString(), { EX: 60 });

                    await new Promise(resolve => setTimeout(resolve, TIMEOUT_SECONDS * 1000));

                    const savedTimeout = await redis.get(timeoutKey);
                    const now = Date.now();

                    if (savedTimeout && parseInt(savedTimeout) > now) {
                        app.log.info("[WhatsApp Cloud] Gathering more messages...");
                        return;
                    }

                    const groupedMessages = await redis.lRange(bufferKey, 0, -1);

                    await redis.del(bufferKey);
                    await redis.del(timeoutKey);

                    if (!groupedMessages || groupedMessages.length === 0) {
                        return;
                    }

                    const fullMessage = groupedMessages.join("\n");

                    const conversationId = memoryService.generateConversationId(agent.id, whatsapp.remoteJid);
                    const history = await memoryService.getHistory(conversationId);

                    const aiResponse = await langchainService.executeAgent({
                        agent,
                        messageHistory: history,
                        message: fullMessage,
                        whatsappContext: {
                            instanceName: agent.id.toString(),
                            remoteJid: whatsapp.remoteJid,
                            sender: whatsapp.sender
                        }
                    });

                    app.log.info(`[WhatsApp Cloud Webhook] AI Response for ${whatsapp.remoteJid}: "${aiResponse}"`);

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

                        await cloudService.sendMessage({
                            phoneNumberId: phoneNumberId,
                            accessToken: agentData.waba_access_token,
                            number: whatsapp.remoteJid,
                            message: segment
                        });
                    }

                } catch (err) {
                    app.log.error(err, "Error in async whatsapp cloud process");
                }
            })().catch(err => app.log.error(err, "Error in whatsapp cloud async IIFE"));

        } catch (err) {
            app.log.error(err, "Error in whatsapp cloud webhook process");
            if (!reply.sent) return reply.status(500).send({ error: (err as Error).message });
        }
    });
};
