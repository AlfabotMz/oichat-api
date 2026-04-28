import { ID } from "../shared/types.ts";

export interface WhatsappCloudApiConfig {
    url: string; // usually https://graph.facebook.com/v22.0
}

export class WhatsappCloudApiService {
    private config: WhatsappCloudApiConfig;

    constructor(config: WhatsappCloudApiConfig) {
        this.config = config;
    }

    public getServerUrl(): string {
        return this.config.url;
    }

    public async sendMessage(params: {
        phoneNumberId: string,
        accessToken: string,
        number: string,
        message: string
    }) {
        const { phoneNumberId, accessToken, number, message } = params;

        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: number,
                type: "text",
                text: {
                    preview_url: false,
                    body: message
                }
            })
        };

        try {
            const response = await fetch(`${this.config.url}/${phoneNumberId}/messages`, options);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`WhatsApp Cloud API error! status: ${response.status} - ${errorText}`);
            }
            return await response.json();
        } catch (err) {
            console.error('[WhatsappCloudApiService] Error sending message:', err);
            throw err;
        }
    }

    public async sendMedia(params: {
        phoneNumberId: string,
        accessToken: string,
        number: string,
        mediaUrl: string,
        mediatype: "image" | "video" | "audio" | "document",
        caption?: string
    }) {
        const { phoneNumberId, accessToken, number, mediaUrl, mediatype, caption } = params;

        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: number,
                type: mediatype,
                [mediatype]: {
                    link: mediaUrl,
                    ...(caption && { caption })
                }
            })
        };

        try {
            const response = await fetch(`${this.config.url}/${phoneNumberId}/messages`, options);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`WhatsApp Cloud API error! status: ${response.status} - ${errorText}`);
            }
            return await response.json();
        } catch (err) {
            console.error('[WhatsappCloudApiService] Error sending media:', err);
            throw err;
        }
    }
}
