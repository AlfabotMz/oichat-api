import { getRedisClient } from "../db/redisClient.ts";
import { Agent, CreateAgent, UpdateAgent } from "../models/enteties/agent.ts";
import { ID } from "../shared/types.ts";
import { AgentRepository, AgentRespositoryImpl } from "./agentRepository.ts";

const AGENT_PREFIX = "agent:";
const CACHE_TTL_SECONDS = 3600; // Cache de 1 hora

// Um objeto simples para serialização, sem as classes customizadas.
type StorableAgent = Omit<Agent, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & {
    id: string;
    userId: string;
    createdAt: string; // ISO string
    updatedAt: string; // ISO string
};

export class CachedAgentRepository {
    private primaryRepository: AgentRepository;

    constructor(primaryRepository: AgentRepository) {
        this.primaryRepository = primaryRepository;
    }

    private toStorable(agent: Agent): StorableAgent {
        return {
            ...agent,
            id: agent.id.toString(),
            userId: agent.userId.toString(),
            createdAt: agent.createdAt.toISOString(),
            updatedAt: agent.updatedAt.toISOString(),
        };
    }

    private fromStorable(storable: StorableAgent): Agent {
        return AgentRespositoryImpl.parseAgentFromDB({
            ...storable,
            user_id: storable.userId,
            created_at: storable.createdAt,
            updated_at: storable.updatedAt,
        });
    }

    async findById(id: ID): Promise<Agent | null> {
        const redis = getRedisClient();
        const cacheKey = `${AGENT_PREFIX}${id.toString()}`;
        const cachedAgent = await redis.get(cacheKey);

        if (cachedAgent) {
            console.log(`CACHE HIT for agent: ${id.toString()}`);
            return this.fromStorable(JSON.parse(cachedAgent));
        }

        console.log(`CACHE MISS for agent: ${id.toString()}`);
        const agent = await this.primaryRepository.findById(id);

        if (agent) {
            await redis.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(this.toStorable(agent)));
        }

        return agent;
    }

    async create(agentData: CreateAgent): Promise<Agent> {
        const redis = getRedisClient();
        const newAgent = await this.primaryRepository.create(agentData);
        // Adiciona o novo agente ao cache
        const cacheKey = `${AGENT_PREFIX}${newAgent.id.toString()}`;
        await redis.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(this.toStorable(newAgent)));
        return newAgent;
    }

    async update(id: ID, updateAgentData: Partial<UpdateAgent>): Promise<Agent> {
        const redis = getRedisClient();
        const updatedAgent = await this.primaryRepository.update(id, updateAgentData);
        // Invalida o cache antigo e atualiza com o novo
        const cacheKey = `${AGENT_PREFIX}${id.toString()}`;
        await redis.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(this.toStorable(updatedAgent)));
        return updatedAgent;
    }

    async delete(id: ID): Promise<void> {
        const redis = getRedisClient();
        await this.primaryRepository.delete(id);
        // Invalida o cache
        const cacheKey = `${AGENT_PREFIX}${id.toString()}`;
        await redis.del(cacheKey);
    }

    async setPrompt(id: ID, prompt: string): Promise<void> {
        await this.primaryRepository.setPrompt(id, prompt);
        const redis = getRedisClient();
        const cacheKey = `${AGENT_PREFIX}${id.toString()}`;
        await redis.del(cacheKey);
    }

    // --- Métodos que apenas delegam para o repositório primário ---
    findByUser(userId: ID): Promise<Agent[]> {
        return this.primaryRepository.findByUser(userId);
    }

    search(query: string, userId?: ID): Promise<Agent[]> {
        return this.primaryRepository.search(query, userId);
    }
}