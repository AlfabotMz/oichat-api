import { SupabaseClient } from "@supabase/supabase-js";
import { getRedisClient } from "../db/redisClient.ts";
import { ID } from "../shared/types.ts";
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
    private agentRepository: AgentRespositoryImpl;
    private analyticsRepository: AnalyticsRepositoryImpl;

    constructor(supabase: SupabaseClient) {
        this.supabase = supabase;
        this.agentRepository = new AgentRespositoryImpl(supabase);
        this.analyticsRepository = new AnalyticsRepositoryImpl(supabase);
    }

    public async processConversion(data: ConversionData): Promise<void> {
        const {
            agent_id,
            instanceName,
            date,
            whatsapp_number,
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

        // 5. Send notification to Frontend
        await this.sendFrontendNotification(date, agent_id, message, whatsapp_number);

        // 6. Save redis flag (48h)
        await redis.set(redisKey, "true", { EX: 172800 });
    }

    private async sendFrontendNotification(date: string, agentId: string, textFormulario: string, userNumber: string) {
        const cleanUserNumber = userNumber.split("@")[0];
        const payload = {
            date,
            agentId,
            userNumber: cleanUserNumber,
            form: textFormulario
        };

        const webhookUrl = Deno.env.get("FRONTEND_NOTIFICATION_WEBHOOK_URL");
        if (webhookUrl) {
            try {
                const response = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (response.ok) {
                    console.log(`[Notification] Frontend webhook sent successfully to ${webhookUrl}.`);
                } else {
                    console.error(`[Notification] Frontend webhook returned status ${response.status}.`);
                }
            } catch (err) {
                console.error(`[Notification] Failed to send frontend webhook to ${webhookUrl}:`, err);
            }
        } else {
            console.log(`[Notification] Simulated sending to Frontend (URL not set in env variables):`, JSON.stringify(payload));
        }
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
            .replace(/{{amount}}/g, vars.amount?.toString() ?? "")
            .replace(/{{quantity}}/g, vars.quantity?.toString() ?? "");
    }
}

