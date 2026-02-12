import { ID, WhatsappJid } from "../shared/types.ts";

export interface EvolutionApiConfig {
    url: string;
    apiKey: string;
}

export class EvolutionApiService {
    private config: EvolutionApiConfig;

    constructor(config: EvolutionApiConfig) {
        this.config = config;
    }

    public getServerUrl(): string {
        return this.config.url;
    }

    public async sendMessage(params: {
        instance: string,
        message: string,
        number: string,
        delay?: number,
        presence?: "composing" | "recording"
    }) {
        const { instance, message, number, delay, presence } = params

        const options = {
            method: 'POST',
            headers: { apikey: this.config.apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                number,
                text: message,
                delay: delay || 0,
                presence: presence || "composing"
            })
        };

        try {
            const response = await fetch(`${this.config.url}/message/sendText/${instance}`, options);
            return await response.json();
        } catch (err) {
            console.error(err);
            throw err;
        }
    }

    public async sendMedia(params: {
        instance: string,
        number: string,
        media: string, // URL or base64
        mediatype: "image" | "video" | "audio" | "document",
        caption?: string,
        delay?: number,
        presence?: "composing" | "recording"
    }) {
        const { instance, number, media, mediatype, caption, delay, presence } = params;

        const options = {
            method: 'POST',
            headers: { apikey: this.config.apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                number,
                media,
                mediatype,
                caption: caption || "",
                delay: delay || 0,
                presence: presence || "composing"
            })
        };

        try {
            const response = await fetch(`${this.config.url}/message/sendMedia/${instance}`, options);
            return await response.json();
        } catch (err) {
            console.error(err);
            throw err;
        }
    }

    public async createInstace(params: { name: string, id: ID }) {
        const { name, id } = params
        const WEBHOOK_EVENTS = "[MESSAGES_UPSERT]"
        const BASE_URL = Deno.env.get("PROJECT_BASEURL")!


        const options = {
            method: 'POST',
            headers: { apikey: this.config.apiKey, 'Content-Type': 'application/json' },
            body: `{"instanceName":"${name}", "integration": "WHATSAPP-BAILEYS","webhook":{"url":"${BASE_URL}/webhook/${id.toString()}", "Content-Type": "application/json", "events":"${WEBHOOK_EVENTS}"}, "groupsIgnore":true,"readMessages":true,"alwaysOnline":true,"readStatus":false, "syncFullHistory": false}`
        };

        try {
            const response = await fetch(`${this.config.url}/instance/create`, options)

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`)
            }

            const json = await response.json()
        } catch (error) {
            throw error
        }

    }

    public async connectInstaceWithCode(instance: string) {
        const options = {
            method: 'GET',
            headers: { apikey: this.config.apiKey, 'Content-Type': 'application/json' },
        };

        try {
            const response = await fetch(`${this.config.url}/instance/connect/${instance}`, options)

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status} ${response.statusText}. Response: ${errorText}`)
            }

            const json = await response.json()
            console.log('[EvolutionAPI] connectInstaceWithCode response:', JSON.stringify(json));
            return json
        } catch (error) {
            console.error('[EvolutionAPI] Error in connectInstaceWithCode:', error);
            throw error
        }
    }

    public async checkInstanceState(instance: string) {
        const options = {
            method: 'GET',
            headers: { apikey: this.config.apiKey, 'Content-Type': 'application/json' },
        };

        try {
            const response = await fetch(`${this.config.url}/instance/connectionState/${instance}`, options)

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status} ${response.statusText}. Response: ${errorText}`)
            }

            const json = await response.json()
            console.log('[EvolutionAPI] checkInstanceState response:', JSON.stringify(json));
            return json

        } catch (error) {
            console.error('[EvolutionAPI] Error in checkInstanceState:', error);
            throw error
        }


    }

    public async logoutInstance(instance: string) {
        const options = {
            method: 'DELETE',
            headers: { apikey: this.config.apiKey, 'Content-Type': 'application/json' },
        };

        try {
            const response = await fetch(`${this.config.url}/instance/logout/${instance}`, options);
            const json = await response.json();
            return json;
        } catch (error) {
            throw error;
        }
    }

    public async deleteInstance(instance: string) {
        const options = {
            method: 'DELETE',
            headers: { apikey: this.config.apiKey, 'Content-Type': 'application/json' },
        };

        try {
            const response = await fetch(`${this.config.url}/instance/delete/${instance}`, options);
            const json = await response.json();
            return json;
        } catch (error) {
            throw error;
        }
    }

    public async fetchInstance(instance: string) {
        const options = {
            method: 'GET',
            headers: { apikey: this.config.apiKey, 'Content-Type': 'application/json' },
        };

        try {
            const response = await fetch(`${this.config.url}/instance/fetchInstances?instanceName=${instance}`, options);
            const json = await response.json();
            return json;
        } catch (error) {
            throw error;
        }
    }

}