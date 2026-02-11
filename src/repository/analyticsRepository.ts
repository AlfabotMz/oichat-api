import { SupabaseClient } from "@supabase/supabase-js";
import { CreateAnalytics, Analytics } from "../models/enteties/analytics.ts";
import { ID } from "../shared/types.ts";

const DB_NAME = "analytics"

export interface AnalyticsRepository {
    create(data: CreateAnalytics): Promise<Analytics>;
    deleteByAgentId(agentId: ID): Promise<void>;
}

export class AnalyticsRepositoryImpl implements AnalyticsRepository {
    private supabase: SupabaseClient;

    constructor(supabase: SupabaseClient) {
        this.supabase = supabase;
    }

    async deleteByAgentId(agentId: ID): Promise<void> {
        const { error } = await this.supabase
            .from(DB_NAME)
            .delete()
            .eq("agent_id", agentId.toString());

        if (error) throw new Error(`Error deleting analytics: ${error.message}`);
    }

    async create(data: CreateAnalytics): Promise<Analytics> {
        const { data: inserted, error } = await this.supabase.from(DB_NAME).insert({
            agent_id: data.agentId.toString(),
            total_messages: data.totalMessages,
            total_conversations: data.totalConversations,
            avg_response_time: data.avgResponseTime,
            conversions: data.conversions
        })
            .select()
            .single();

        if (error) throw new Error(`Error creating analytics: ${error.message}`);
        if (!inserted) throw new Error("No analytics data returned");

        return {
            id: ID.from(inserted.id),
            agentId: ID.from(inserted.agent_id),
            totalMessages: inserted.total_messages,
            totalConversations: inserted.total_conversations,
            avg_response_time: inserted.avg_response_time,
            date: inserted.date,
            createdAt: new Date(inserted.created_at),
            conversions: Number(inserted.conversions)
        };
    }
}
