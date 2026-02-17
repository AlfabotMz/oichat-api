import { EvolutionApiService } from "./evolutionApiService.ts";

export class NotificationService {
    private evolutionService: EvolutionApiService;
    private readonly alertNumber = "258840235890";
    private readonly alertInstance = "alert";

    constructor() {
        this.evolutionService = new EvolutionApiService({
            apiKey: Deno.env.get("EVOLUTION_API_KEY")!,
            url: Deno.env.get("EVOLUTION_API_URL")!
        });
    }

    public async sendErrorAlert(error: Error, requestInfo?: { method: string, url: string, body?: any }) {
        const timestamp = new Date().toLocaleString("pt-BR", { timeZone: "Africa/Maputo" });

        let message = `🚨 *OICHAT API ERROR ALERT* 🚨\n\n`;
        message += `*Data/Hora:* ${timestamp}\n`;
        message += `*Erro:* ${error.name}: ${error.message}\n`;

        if (requestInfo) {
            message += `*Rota:* [${requestInfo.method}] ${requestInfo.url}\n`;
            if (requestInfo.body) {
                const bodyStr = JSON.stringify(requestInfo.body, null, 2);
                message += `*Body:* ${bodyStr.substring(0, 500)}${bodyStr.length > 500 ? '...' : ''}\n`;
            }
        }

        message += `\n*Stack Trace (Resumo):*\n\`\`\`\n${error.stack?.split('\n').slice(0, 5).join('\n')}\n\`\`\``;

        try {
            await this.evolutionService.sendMessage({
                instance: this.alertInstance,
                number: this.alertNumber,
                message: message
            });
            console.log(`[NotificationService] Error alert sent to ${this.alertNumber}`);
        } catch (err) {
            console.error(`[NotificationService] Failed to send error alert:`, err);
        }
    }
}

export const notificationService = new NotificationService();
