import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { Agent } from "../models/enteties/agent.ts"
import { Message, WebMessage } from "../models/enteties/message.ts";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ConversionService } from "./conversionService.ts";
import { supabase } from "../db/supabaseClient.ts";
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

// Prompt system do agente de atendimento da oichat
const SYSTEM_PROMPT = `
<OiChatAgent>
    <PromptPrincipal>
        {prompt}
    </PromptPrincipal>

    <Anexos>
        {anexos}
    </Anexos>

    <PromptGeralImportante>

        Você é um atendente virtual do sistema OiChat — um assistente moderno, minimalista e humano.
        Seu papel é representar empresas e produtos no WhatsApp de forma simpática, eficiente e natural.

        <!-- Diretrizes principais -->
        <Diretrizes>
            <Tom>
                Moderno, amigável, natural e direto. Frases curtas. Sempre positivo.
            </Tom>

            <Linguagem>
                Minimalista. Sem exageros, sem repetições desnecessárias.
                Paleta de comunicação inspirada em: roxo, preto e branco.
            </Linguagem>

            <Objetivo>
                Transformar interesse em ação: compra, resposta, envio de dados ou agendamento.
            </Objetivo>

            <Comportamento>
                Não se apresente como IA.
                Personalize conforme o contexto do usuário.
                Mostre iniciativa sem pressionar.
                Links devem ser enviados normalmente (serão exibidos como mídia).
                Não use respostas neutras ou mecânicas.
            </Comportamento>

            <ErrosDeFerramentas>
                Se alguma tool der erro ou comportamento inesperado,
                NÃO informe isso ao usuário.
                Apenas responda de maneira natural, sem revelar falhas internas.
            </ErrosDeFerramentas>

            <Obediencia>
                O agente deve sempre seguir as diretrizes acima
                e priorizar o entendimento do contexto fornecido em:
                - <PromptPrincipal>
                - <Anexos>
            </Obediencia>
        </Diretrizes>

        <!-- NOVA SEÇÃO: Funções Internas -->
        <Funcoes>

            <!-- Função de conversão -->
            <Funcao name="send_conversation">
                Esta função deve ser executada SEMPRE que ocorrer qualquer tipo de conversão,
                incluindo (mas não limitado a):
                - Cliente fornece todos os dados solicitados.
                - Cliente confirma compra, interesse firme ou agendamento.
                - Cliente envia informações obrigatórias após solicitação direta.
                - Cliente realiza ação desejada (ex: escolher imóvel, confirmar visita, aceitar oferta).
                
                Ao identificar um comportamento de conversão, execute:
                \`send_conversation\`

                Observações:
                - Não peça permissão ao usuário antes de chamar a função.
                - Não mencione a função ou a execução dela ao usuário.
                - Continue a conversa de forma natural depois de acionar a função.
            </Funcao>

        </Funcoes>

    </PromptGeralImportante>
</OiChatAgent>
`

export class LangchainService {
    private model: ChatOpenAI;
    private conversionService: ConversionService;

    // Inicialização da classe de serviço do langchain
    constructor() {
        this.model = new ChatOpenAI({
            modelName: Deno.env.get("MODEL_NAME") || "openai/o4-mini",
            openAIApiKey: Deno.env.get("OPENROUTER_API_KEY"),
            configuration: {
                baseURL: Deno.env.get("OPENROUTER_API_BASE") || "https://openrouter.ai/api/v1",
            }
        });
        this.conversionService = new ConversionService(supabase);
    }

    public async executeAgent(params: {
        agent: Agent,
        messageHistory: (Message | WebMessage)[],
        message: string,
        whatsappContext?: {
            instanceName: string,
            remoteJid: string,
            sender: string
        }
    }): Promise<string> {
        const { agent, messageHistory, message, whatsappContext } = params;

        // 1. Define Tools
        const sendConversationTool = tool(
            async (input) => {
                if (whatsappContext) {
                    await this.conversionService.processConversion({
                        ...input,
                        agent_id: agent.id.toString(),
                        instanceName: whatsappContext.instanceName,
                        remoteJid: whatsappContext.remoteJid,
                        whatsapp_number: whatsappContext.remoteJid, // Simplified
                        number: whatsappContext.sender,
                        contact_owner: agent.contactOwner || "",
                        contact_delivery: agent.contactDelivery || ""
                    });
                    return "Conversão registrada com sucesso!";
                }
                return "Erro: Contexto do WhatsApp ausente.";
            },
            {
                name: "send_conversation",
                description: "Registra uma conversão/venda. Use as informações disponíveis em <Anexos> para preencher os campos 'product' e 'amount' corretamente.",
                schema: z.object({
                    location: z.string().describe("Localização/Endereço de entrega"),
                    product: z.string().describe("Nome do produto (verifique nos <Anexos> se disponível)"),
                    amount: z.number().describe("Preço total (verifique nos <Anexos> se disponível)"),
                    quantity: z.number().describe("Quantidade de itens"),
                    date: z.string().describe("Data da entrega (YYYY-MM-DD)")
                }),
            }
        );

        const tools = [sendConversationTool];
        const modelWithTools = this.model.bindTools(tools);

        // 2. Format Messages
        const chatHistory: BaseMessage[] = messageHistory.map(m => {
            return m.fromMe ? new AIMessage(m.content) : new HumanMessage(m.content);
        });

        const systemMessage = SYSTEM_PROMPT
            .replace("{prompt}", agent.prompt || "")
            .replace("{anexos}", JSON.stringify(agent.anexos || {}));

        const prompt = ChatPromptTemplate.fromMessages([
            new SystemMessage(systemMessage),
            new MessagesPlaceholder("history"),
            ["human", "{input}"],
        ]);

        // 3. Execution (Simple loop for tool calling or use AgentExecutor)
        // For brevity and compliance with the 12s grouping, we'll keep it simple
        const chain = prompt.pipe(modelWithTools);
        const result = await chain.invoke({
            input: message,
            history: chatHistory
        });

        if (result.tool_calls && result.tool_calls.length > 0) {
            for (const toolCall of result.tool_calls) {
                if (toolCall.name === "send_conversation") {
                    await sendConversationTool.call(toolCall.args);
                }
            }
            // Return a confirmation if a tool was called, or re-run model
            return result.content.toString() || "Entendido! Registrei seu pedido.";
        }

        return result.content.toString();
    }

    public async transcribeAudio(base64: string): Promise<string> {
        // Using a multimodal prompt for transcription
        const message = new HumanMessage({
            content: [
                { type: "text", text: "Transcrição deste áudio para texto em português. Responda APENAS a transcrição." },
                {
                    type: "file",
                    data: base64,
                    mime_type: "audio/mpeg" // Evolution usually sends mp3/ogg base64
                }
            ]
        });

        try {
            const response = await this.model.invoke([message]);
            return response.content.toString();
        } catch (err) {
            console.error("Transcription error:", err);
            return "[Erro na transcrição do áudio]";
        }
    }

    public async analyzeImage(base64: string): Promise<string> {
        const message = new HumanMessage({
            content: [
                { type: "text", text: "Descreva o que você vê nesta imagem de forma concisa. Responda em português." },
                {
                    type: "image_url",
                    image_url: { url: `data:image/jpeg;base64,${base64}` }
                }
            ]
        });

        try {
            const response = await this.model.invoke([message]);
            return response.content.toString();
        } catch (err) {
            console.error("Vision error:", err);
            return "[Erro na análise da imagem]";
        }
    }
}