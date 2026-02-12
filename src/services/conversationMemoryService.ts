import { getRedisClient } from "../db/redisClient.ts";
import { WebMessage } from "../models/enteties/message.ts";
import { ID } from "../shared/types.ts";

const CONVERSATION_PREFIX = "conversation:";
const MEMORY_TTL_SECONDS = 172800; // 48 horas (2 dias)
const MAX_MESSAGES = 30; // Guarda as últimas 30 mensagens

export class RedisConversationMemory {

    public generateConversationId(agentId: ID, remoteJid: string): string {
        return `${CONVERSATION_PREFIX}${agentId.toString()}:${remoteJid}`;
    }

    async addMessage(conversationId: string, message: WebMessage): Promise<void> {
        const redis = getRedisClient();
        const messageJson = JSON.stringify(message);

        // Adiciona a nova mensagem à direita (final) da lista
        await redis.rPush(conversationId, messageJson);

        // Mantém a lista com no máximo MAX_MESSAGES, removendo as mais antigas
        await redis.lTrim(conversationId, -MAX_MESSAGES, -1);

        // Atualiza o tempo de expiração da conversa
        await redis.expire(conversationId, MEMORY_TTL_SECONDS);
    }

    async getHistory(conversationId: string): Promise<WebMessage[]> {
        const redis = getRedisClient();
        const historyJson = await redis.lRange(conversationId, 0, -1);

        if (!historyJson || historyJson.length === 0) {
            return [];
        }

        return historyJson.map(json => JSON.parse(json) as WebMessage);
    }

    async clearHistory(conversationId: string): Promise<void> {
        const redis = getRedisClient();
        await redis.del(conversationId);
    }
}