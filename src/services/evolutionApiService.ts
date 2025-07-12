import { ID, WhatsappJid } from "../shared/types.ts";

export interface EvolutionApiConfig {
    url: string;
    apiKey: string;
}

export class EvolutionApiService {
    private config: EvolutionApiConfig;

    constructor (config: EvolutionApiConfig) {
        this.config = config;
    }

    public getServerUrl(): string {
        return this.config.url;
    }

    public sendMessage(params: {instance: string, message: string, number: string }) {
        const { instance, message, number } = params

        const options = {
            method: 'POST',
            headers: {apikey: this.config.apiKey, 'Content-Type': 'application/json'},
            body: `{"number":"${number}","text":${message},"options":{"quoted":{"key":{"remoteJid":"${number}"}}}}`
        };

        console.log("RUNNIG")

        fetch(`${this.config.url}/message/sendText/${instance}`, options)
        .then((response) => response.json())
        .then((_) => {})
        .catch((err) => console.error(err));   
    }

    public async createInstace(params: {name: string, id: ID}) {
        const { name, id } = params
        const WEBHOOK_EVENTS = "[MESSAGES_UPSERT]" 
        const BASE_URL = Deno.env.get("PROJECT_BASEURL")!
        

        const options = {
            method: 'POST',
            headers: {apikey: this.config.apiKey, 'Content-Type': 'application/json'},
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
            headers: {apikey: this.config.apiKey, 'Content-Type': 'application/json'},
        };

        try {
            const response = await fetch(`${this.config.url}/instance/connect/${instance}`, options)

            const json = await response.json()
            return json
        } catch (error) {
            throw error
        }
    }

    public async checkInstanceState(instance: string) {
        const options = {
            method: 'GET',
            headers: {apikey: this.config.apiKey, 'Content-Type': 'application/json'},
        };

        try {
            const response = await fetch(`${this.config.url}/instance/connectionState/${instance}`, options)

            const json = await response.json()
            return json

        } catch (error) {
            throw error
        }


    }


}