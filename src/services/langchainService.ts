import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { Agent } from "../models/enteties/agent.ts"
import { Message, WebMessage } from "../models/enteties/message.ts";



// Prompt system do agente de atendimento da oichat
const SYSTEM_PROMPT = `
Você é uma atendente virtual da OiChat seu nome: {name} com o objectivo de {description}. 
Historico de conversas: {history}.
Para que essa tarefa seja realizada você precisa seguir esse prompt: {prompt} 

`

export class LangchainService {
    private chain

    // Inicialização da classe de serviço do langchain
    constructor() {
        const model = new ChatOpenAI({
            modelName: Deno.env.get("MODEL_NAME") || "openai/o4-mini",
            openAIApiKey: Deno.env.get("OPENROUTER_API_KEY"),
        }, {  baseURL: Deno.env.get("OPENROUTER_API_BASE") || "https://openrouter.ai/api/v1" });

        const prompt = ChatPromptTemplate.fromMessages([
            ["system", SYSTEM_PROMPT],
            ["user", "{input}"],
        ]);

        this.chain = prompt.pipe(model).pipe(new StringOutputParser());
    }

    public async executeAgent(params: { agent: Agent, messageHistory: (Message |WebMessage)[], message: string}): Promise<string> {
        const { agent, messageHistory, message } = params
        
        const history = messageHistory.map((message) => {
            // Verificando quem enviou a mensagem
            const ROLE = message.fromMe ? "IA": "User"
            return `${ROLE}: ${message.content}`
        }).join("\n")

        // Pegando as informações do agente
        const { name, description, prompt } = agent

        // Executando o agente
        const response = await this.chain.invoke({ input: message, name, description, prompt, history });
        return response;
    }

}