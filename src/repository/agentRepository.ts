import { SupabaseClient } from "@supabase/supabase-js";
import { Agent, AgentStatus, CreateAgent, UpdateAgent } from "../models/enteties/agent.ts";
import { ID } from "../shared/types.ts";


const DB_NAME = "agents"
export interface AgentRepository {
    create(data: CreateAgent): Promise<Agent>;
    findById(id: ID): Promise<Agent | null>;
    findByUser(userId: ID): Promise<Agent[]>;
    update(id: ID, data: Partial<UpdateAgent>): Promise<Agent>;
    delete(id: ID): Promise<void>;
    search(query: string, userId?: ID): Promise<Agent[]>;
    setPrompt(id: ID, prompt: string): Promise<void>;
    getUsageStats(agentId: ID): Promise<AgentStatus>;
    clone(id: ID): Promise<Agent>;
}

export class AgentRespositoryImpl implements AgentRepository {
    private supabase: SupabaseClient;

    constructor(supabase: SupabaseClient) {
        this.supabase = supabase;
    }

    static parseAgentFromDB(raw: any): Agent {
        return {
          id: ID.from(raw.id),
          userId: ID.from(raw.user_id),
          name: raw.name,
          description: raw.description,
          prompt: raw.prompt,
          status: raw.status,
          createdAt: new Date(raw.created_at),
          updatedAt: new Date(raw.updated_at),
        };
      }

    async create(agentData: CreateAgent): Promise<Agent> {
        const {data, error} = await this.supabase.from(DB_NAME).insert({
            user_id: agentData.userId.toString(),
            name: agentData.name,
            description: agentData.description,
            prompt: agentData.prompt
        })
        .select()
        .single();

        if (error) throw new Error(`Error when try to create agent: ${error.message}`)
        if (!data) throw new Error("No data returned")

        const agent = AgentRespositoryImpl.parseAgentFromDB(data)
        return agent
    }

    
  async findById(id: ID): Promise<Agent | null> {
    const {data, error} = await this.supabase.from(DB_NAME).select().eq("id", id.toString()).single();
    if (error) throw new Error(`Error when try to find agent: ${error.message}`)
    if (!data) return null
    const agent = AgentRespositoryImpl.parseAgentFromDB(data)
    return agent
  }
  async findByUser(userId: ID): Promise<Agent[]> {
    const {data, error} = await this.supabase.from(DB_NAME).select().eq("user_id", userId.toString());
    if (error) throw new Error(error.message)
    if (!data) return []
    const agents = data.map(AgentRespositoryImpl.parseAgentFromDB)
    return agents

  }
  async update(id: ID, updateAgentData: Partial<UpdateAgent>): Promise<Agent> {
    // Mapeia as chaves de camelCase (modelo) para snake_case (banco de dados)
    const dbUpdateData: { [key: string]: any } = {};
    for (const key in updateAgentData) {
      if (Object.prototype.hasOwnProperty.call(updateAgentData, key)) {
        if (key === 'userId') { // Exemplo de mapeamento, adicione outros se necessário
          dbUpdateData['user_id'] = (updateAgentData as any)[key];
        } else {
          dbUpdateData[key] = (updateAgentData as any)[key];
        }
      }
    }
    const {data, error} = await this.supabase.from(DB_NAME).update(dbUpdateData).eq("id", id.toString()).select().single();
    if (error) throw new Error(`Error when try to update agent: ${error.message}`)
    if (!data) throw new Error("No data returned")
    const agent = AgentRespositoryImpl.parseAgentFromDB(data)
    return agent
  }
  async delete(id: ID): Promise<void> {
    const { data, error } = await this.supabase
      .from(DB_NAME)
      .delete()
      .eq("id", id.toString())
      .select(); // Pede ao Supabase para retornar o registro deletado

    if (error) {
      throw new Error(`Error when trying to delete agent: ${error.message}`);
    }

    // Se 'data' estiver vazio, nenhum registro correspondeu ao ID, portanto "não encontrado"
    if (!data || data.length === 0) {
      throw new Error("Agent not found");
    }
  }
  async search(query: string, userId?: ID): Promise<Agent[]> {
    const agents: Agent[] = []
    if (!userId) {
        const {data, error} = await this.supabase.from(DB_NAME).select().like("name", `%$  ${query}%`);

        if (error) throw new Error(`Error when try to search agents: ${error.message}`)
        if (!data) return []

        agents.concat(data.map(AgentRespositoryImpl.parseAgentFromDB))
        return agents

    }

    const {data, error} = await this.supabase.from(DB_NAME).select().eq("user_id", userId.toString()).like("name", `%${query}%`);

    if (error) throw new Error(`Error when try to search agents: ${error.message}`)
    if (!data) return []

    agents.concat(data.map(AgentRespositoryImpl.parseAgentFromDB))
    return agents
  }
  async setPrompt(id: ID, prompt: string): Promise<void> {
    const {data, error} = await this.supabase.from(DB_NAME).update({prompt}).eq("id", id.toString());
    if (error) throw new Error(`Error when try to set prompt: ${error.message}`)
    if (!data) return   
  }

  async getUsageStats(agentId: ID): Promise<AgentStatus> {
    const {data, error} = await this.supabase.from(DB_NAME).select().eq("id", agentId.toString()).single();
    if (error) throw new Error(error.message)
    if (!data) throw new Error("No data returned")

    const agent = AgentRespositoryImpl.parseAgentFromDB(data)
    return agent.status
  }
  async clone(id: ID): Promise<Agent> {
    const {data, error} = await this.supabase.from(DB_NAME).select().eq("id", id.toString()).single();
    if (error) throw new Error(error.message)
    if (!data) throw new Error("No data returned")

    const agentOld = AgentRespositoryImpl.parseAgentFromDB(data)
    
    try {
        const agentClone: Agent = await this.create({
            userId: agentOld.userId,
            name: agentOld.name,
            description: agentOld.description,
            prompt: agentOld.prompt,
            status: agentOld.status
        })

        return agentClone
    } catch (error: any) {
        throw new Error(`Error when try to clone agent: ${error.message}`)
    }
  }
}
    