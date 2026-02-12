import { SupabaseClient } from "@supabase/supabase-js";
import { getRedisClient } from "../db/redisClient.ts";
import { ID } from "../shared/types.ts";
import { EvolutionApiService } from "./evolutionApiService.ts";
import { AgentRespositoryImpl } from "../repository/agentRepository.ts";
import { AnalyticsRepositoryImpl } from "../repository/analyticsRepository.ts";

export interface ConversionData {
    location: string;
    number: string;
    product: string;
    contact_owner: string;
    contact_delivery: string;
    agent_id: string;
    instanceName: string;
    date: string;
    whatsapp_number: string;
    amount: number;
    quantity: number;
}

export class ConversionService {
    private supabase: SupabaseClient;
    private evolutionService: EvolutionApiService;
    private agentRepository: AgentRespositoryImpl;
    private analyticsRepository: AnalyticsRepositoryImpl;

    constructor(supabase: SupabaseClient) {
        this.supabase = supabase;
        this.evolutionService = new EvolutionApiService({
            apiKey: Deno.env.get("EVOLUTION_API_KEY")!,
            url: Deno.env.get("EVOLUTION_API_URL")!
        });
        this.agentRepository = new AgentRespositoryImpl(supabase);
        this.analyticsRepository = new AnalyticsRepositoryImpl(supabase);
    }

    public async processConversion(data: ConversionData): Promise<void> {
        const {
            location,
            number,
            product,
            contact_owner,
            contact_delivery,
            agent_id,
            instanceName,
            date,
            whatsapp_number,
            amount,
            quantity
        } = data;

        const redis = getRedisClient();
        const redisKey = `Converted.${instanceName}.${whatsapp_number}`;

        // 1. Check duplicate (Redis)
        const alreadyConverted = await redis.get(redisKey);
        if (alreadyConverted) {
            console.log(`Conversion already processed for ${whatsapp_number}`);
            return;
        }

        // 2. Update Analytics
        try {
            const agentId = ID.from(agent_id);
            // Using existing analytics repository logic
            // It handles create/update inside its own logic if we want, 
            // but let's stick to the flow: check exists -> update or create
            const { data: analytics, error: fetchError } = await this.supabase
                .from("analytics")
                .select("*")
                .eq("agent_id", agent_id)
                .single();

            if (analytics) {
                await this.supabase
                    .from("analytics")
                    .update({ conversions: (analytics.conversions || 0) + 1 })
                    .eq("agent_id", agent_id);
            } else {
                await this.analyticsRepository.create({
                    agentId: agentId,
                    totalMessages: 0,
                    totalConversations: 1,
                    conversions: 1
                });
            }
        } catch (err) {
            console.error("Error updating analytics:", err);
        }

        // 3. Get Agent for custom message template
        const agent = await this.agentRepository.findById(ID.from(agent_id));
        const template = agent?.customMessage || "";

        // 4. Build message
        const message = this.buildMessage(template, data);

        // 5. Send notifications
        if (contact_owner) {
            await this.evolutionService.sendMessage({
                instance: instanceName,
                number: contact_owner.length <= 9 ? `258${contact_owner}` : contact_owner,
                message: message + "\n\n🤖 Parabéns! Você tem uma nova venda."
            });
        }

        if (contact_delivery) {
            await this.evolutionService.sendMessage({
                instance: instanceName,
                number: contact_delivery.length <= 9 ? `258${contact_delivery}` : contact_delivery,
                message: message + "\n\n🚚 Nova entrega solicitada!"
            });
        }

        // 6. Save redis flag (48h)
        await redis.set(redisKey, "true", { EX: 172800 });
    }

    private buildMessage(template: string, vars: ConversionData): string {
        if (!template) {
            // Fallback default message
            return `✅ Nova Venda!\nProduto: ${vars.product}\nValor: ${vars.amount} MT\nQuantidade: ${vars.quantity}\nLocal: ${vars.location}\nContacto: ${vars.number}`;
        }
        return template
            .replace(/{{product}}/g, vars.product ?? "")
            .replace(/{{number}}/g, vars.number ?? "")
            .replace(/{{location}}/g, vars.location ?? "")
            .replace(/{{date}}/g, vars.date ?? "")
            .replace(/{{amount}}/g, vars.amount.toString() ?? "")
            .replace(/{{quantity}}/g, vars.quantity.toString() ?? "");
    }
}
