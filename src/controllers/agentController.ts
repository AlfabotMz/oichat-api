import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { CreateAgent } from "../models/enteties/agent.ts";
import { ID } from "../shared/types.ts";
import z from "zod/v4";
import { supabase } from "../db/supabaseClient.ts";
import { CachedAgentRepository } from "../repository/cachedAgentRepository.ts";
import { AgentRespositoryImpl } from "../repository/agentRepository.ts";
import { EvolutionApiService } from "../services/evolutionApiService.ts";
import { AnalyticsRepositoryImpl } from "../repository/analyticsRepository.ts";
import "@std/dotenv";




import {
  ErrorResponseSchemaJson,
} from "../jsonSchemaSwagger.ts";

const repository = new CachedAgentRepository(new AgentRespositoryImpl(supabase))
const analyticsRepository = new AnalyticsRepositoryImpl(supabase)

export const agentController = async (app: FastifyInstance) => {

  // n8n compatible endpoint
  app.post("/agents/create-agent", {
    schema: {
      summary: 'Criar um novo agente (n8n compatível)',
      tags: ['Agente'],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;

    // Mapping n8n body to internal CreateAgent
    const agentData: CreateAgent = {
      userId: ID.from(body.user_id),
      name: body.nome,
      prompt: body.prompt,
      phoneNumber: body.phone_number,
      status: "inactive" // Set as inactive per the example response
    };

    try {
      // 1. Create Agent
      const agent = await repository.create(agentData);

      // 2. Create Analytics Row
      try {
        await analyticsRepository.create({
          agentId: agent.id,
          totalMessages: 0,
          totalConversations: 0,
          conversions: 0
        });
      } catch (analyticsError) {
        app.log.error(analyticsError, `Error creating analytics for agent ${agent.id}`);
      }

      // 3. Initialize Evolution API Instance
      const evoService = new EvolutionApiService({
        apiKey: Deno.env.get("EVOLUTION_API_KEY")!,
        url: Deno.env.get("EVOLUTION_API_URL")!
      });

      try {
        await evoService.createInstace({
          name: agent.id.toString(), // Using ID as instance name
          id: agent.id
        });
      } catch (evoError) {
        app.log.error(evoError, `Error creating Evolution instance for agent ${agent.id}`);
      }

      // Map response to n8n format (array)
      const response = [
        {
          success: true,
          message: "Agente criado com sucesso!",
          agent: {
            agent_id: agent.id.toString()
          },
          nome: agent.name,
          prompt: agent.prompt,
          status: agent.status
        }
      ];

      reply.status(200).send(response);
    } catch (error) {
      reply.status(500).send({
        success: false,
        message: `Erro ao criar agente: ${error}`
      });
    }
  });

  // n8n compatible delete endpoint
  app.post("/agents/delete-agent", {
    schema: {
      summary: 'Deletar um agente (n8n compatível)',
      tags: ['Agente'],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    const agentIdStr = body.agent_id;

    if (!agentIdStr) {
      return reply.status(400).send({
        success: false,
        message: "ID do agente não fornecido"
      });
    }

    try {
      const agentId = ID.from(agentIdStr);

      // 1. Verificar se o agente existe
      const agent = await repository.findById(agentId);
      if (!agent) {
        return reply.status(404).send({
          success: false,
          message: "Agente não encontrado"
        });
      }

      // 2. Deletar instância na Evolution API (se existir)
      // O nome da instância é o mesmo que o ID do agente ou o instanceName salvo
      const instanceToDelete = agent.instanceName;
      const evoService = new EvolutionApiService({
        apiKey: Deno.env.get("EVOLUTION_API_KEY")!,
        url: Deno.env.get("EVOLUTION_API_URL")!
      });

      try {
        await evoService.deleteInstance(instanceToDelete);
      } catch (evoError) {
        app.log.warn(evoError, `Erro ao deletar instância ${instanceToDelete} na Evolution API`);
        // Prosseguir mesmo se a instância não existir ou falhar
      }

      // 3. Deletar Analytics
      try {
        await analyticsRepository.deleteByAgentId(agent.id);
      } catch (analyticsError) {
        app.log.warn(analyticsError, `Erro ao deletar analytics para o agente ${agent.id}`);
      }

      // 4. Deletar Agente no Banco
      await repository.delete(agent.id);

      reply.status(200).send({
        success: true,
        message: "Agente e recursos associados deletados com sucesso"
      });
    } catch (error) {
      app.log.error(error, `Erro ao deletar agente ${agentIdStr}`);
      reply.status(500).send({
        success: false,
        message: `Erro ao deletar agente: ${error}`
      });
    }
  });


  // --- WhatsApp Endpoints (Migrated) ---

  const connectInstanceValidationSchema = z.object({ agent_id: z.string().min(1) });
  type ConnectInstanceBody = { agent_id: string };

  app.post("/agents/connect-whatsapp", {
    schema: {
      summary: "Connect agent to WhatsApp (n8n compatible)",
      tags: ["Agent"],
    },
  }, async (request, reply) => {
    const body = request.body as any;
    const { agent_id } = body;

    if (!agent_id) {
      return reply.status(400).send({ success: false, message: "ID do agente não fornecido" });
    }

    try {
      // 1. Get Agent
      app.log.info(`[connect-whatsapp] Buscando agente ${agent_id}`);
      const agent = await repository.findById(ID.from(agent_id));
      if (!agent) {
        return reply.status(404).send({ success: false, message: "Agente não encontrado" });
      }

      const instanceName = agent.instanceName || agent.id.toString();
      app.log.info(`[connect-whatsapp] Instance name: ${instanceName}`);

      const evoService = new EvolutionApiService({
        apiKey: Deno.env.get("EVOLUTION_API_KEY")!,
        url: Deno.env.get("EVOLUTION_API_URL")!
      });

      // 2. Check Instance State
      let connectionState;
      try {
        app.log.info(`[connect-whatsapp] Verificando estado da instância ${instanceName}`);
        connectionState = await evoService.checkInstanceState(instanceName);
        app.log.info(`[connect-whatsapp] Estado da conexão:`, connectionState);
      } catch (e) {
        app.log.warn(`[connect-whatsapp] Instance ${instanceName} might not exist yet: ${e}`);
        // If it doesn't exist, create it
        try {
          app.log.info(`[connect-whatsapp] Criando nova instância ${instanceName}`);
          await evoService.createInstace({ name: instanceName, id: agent.id });
          app.log.info(`[connect-whatsapp] Instância criada com sucesso`);

          // Wait for instance to be ready
          app.log.info(`[connect-whatsapp] Aguardando instância ficar pronta...`);
          await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (createErr) {
          app.log.error(`[connect-whatsapp] Erro ao criar instância:`, createErr);
          return reply.status(500).send({ success: false, message: `Erro ao criar instância: ${createErr}` });
        }
      }

      // 3. If connected, disconnect (logout)
      if (connectionState?.instance?.state === "open") {
        try {
          app.log.info(`[connect-whatsapp] Instância já conectada, fazendo logout...`);
          await evoService.logoutInstance(instanceName);
          app.log.info(`[connect-whatsapp] Logout realizado com sucesso`);
        } catch (logoutErr) {
          app.log.warn(`[connect-whatsapp] Erro ao desconectar instância ${instanceName}: ${logoutErr}`);
        }
      }

      // 4. Connect and get QR Code
      try {
        app.log.info(`[connect-whatsapp] Solicitando QR code para ${instanceName}`);
        const connectData = await evoService.connectInstaceWithCode(instanceName);
        app.log.info(`[connect-whatsapp] Resposta da Evolution API:`, JSON.stringify(connectData));

        // Check various possible QR code field names
        const qrCode = connectData.base64 || connectData.code || connectData.qrcode || connectData.qr;

        if (!qrCode) {
          app.log.error(`[connect-whatsapp] QR code não encontrado na resposta. Campos disponíveis:`, Object.keys(connectData));
          return reply.status(500).send({
            success: false,
            message: `QR code não encontrado na resposta da API. Resposta: ${JSON.stringify(connectData)}`
          });
        }

        app.log.info(`[connect-whatsapp] QR code gerado com sucesso`);
        reply.status(200).send({
          success: true,
          qr: qrCode,
          status: "pending",
          message: "Escaneie o QR code para conectar seu número de WhatsApp."
        });
      } catch (connectErr) {
        app.log.error(`[connect-whatsapp] Erro ao gerar QR code:`, connectErr);
        reply.status(500).send({ success: false, message: `Erro ao gerar QR code: ${connectErr}` });
      }

    } catch (error) {
      app.log.error(error, "[connect-whatsapp] Error in connect-whatsapp flow");
      reply.status(500).send({
        success: false,
        message: `Erro interno: ${error}`
      });
    }
  });

  // --- WhatsApp Cloud API Connection (Hosted Embedded Signup) ---
  app.post("/agents/connect-whatsapp-cloud", {
    schema: {
      summary: "Connect agent to WhatsApp Cloud API via Hosted ES",
      tags: ["Agent"],
      body: {
        type: "object",
        properties: {
          waba_id: { type: "string" },
          waba_business_account_id: { type: "string" },
          appsecret_proof: { type: "string" }
        },
        required: ["waba_id", "waba_business_account_id", "appsecret_proof"]
      }
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    const { waba_id, waba_business_account_id, appsecret_proof } = body;

    try {
      app.log.info(`[connect-whatsapp-cloud] Iniciando fluxo p/ WABA ${waba_id}`);

      const systemUserToken = Deno.env.get("SYSTEM_USER_TOKEN");
      if (!systemUserToken) {
        app.log.error("[connect-whatsapp-cloud] SYSTEM_USER_TOKEN not found in env.");
        return reply.status(500).send({ success: false, message: "Server misconfiguration. Missing Meta System Token." });
      }

      // Step 5: Get a business token
      let businessToken = "";
      try {
        app.log.info(`[connect-whatsapp-cloud] Step 5: Buscando Business Token...`);
        const params = new URLSearchParams();
        params.append("appsecret_proof", appsecret_proof);
        params.append("fetch_only", "true");

        const tokenRes = await fetch(`https://graph.facebook.com/v22.0/${waba_business_account_id}/system_user_access_tokens`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${systemUserToken}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params
        });

        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || !tokenData.access_token) {
          app.log.error(`[connect-whatsapp-cloud] Error in Step 5: ${JSON.stringify(tokenData)}`);
          return reply.status(400).send({ success: false, message: "Falha ao obter Token Comercial (Step 5)." });
        }
        businessToken = tokenData.access_token;
      } catch (err) {
        app.log.error(`[connect-whatsapp-cloud] Error in Step 5 (Request): ${err}`);
        return reply.status(500).send({ success: false, message: "Erro de rede no Passo 5" });
      }

      // Step 6: Get the customer's business phone number ID
      let phoneNumberId = "";
      let phoneNumberDisplay = "";
      try {
        app.log.info(`[connect-whatsapp-cloud] Step 6: Buscando Phone Number ID...`);
        const phoneRes = await fetch(`https://graph.facebook.com/v22.0/${waba_id}/phone_numbers`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${businessToken}`
          }
        });

        const phoneData = await phoneRes.json();
        if (!phoneRes.ok || !phoneData.data || phoneData.data.length === 0) {
          app.log.error(`[connect-whatsapp-cloud] Error in Step 6: ${JSON.stringify(phoneData)}`);
          return reply.status(400).send({ success: false, message: "Não foi possível encontrar números (Step 6)." });
        }

        const phoneEntry = phoneData.data[0];
        phoneNumberId = phoneEntry.id;
        phoneNumberDisplay = phoneEntry.display_phone_number;
      } catch (err) {
        app.log.error(`[connect-whatsapp-cloud] Error in Step 6 (Request): ${err}`);
        return reply.status(500).send({ success: false, message: "Erro de rede no Passo 6" });
      }

      // Step 7: Onboard the customer (Register the phone number)
      try {
        app.log.info(`[connect-whatsapp-cloud] Step 7: Registrando Phone Number...`);
        const pin = Math.floor(100000 + Math.random() * 900000).toString(); // Secure 6 digit PIN

        const registerRes = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/register`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${businessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            pin: pin
          })
        });
        const registerData = await registerRes.json();
        app.log.info(`[connect-whatsapp-cloud] Register result: ${JSON.stringify(registerData)}`);
      } catch (err) {
        app.log.error(`[connect-whatsapp-cloud] Error in Step 7: ${err}`);
      }

      // Optionally subscribe our webhook automatically
      try {
        const subscribeRes = await fetch(`https://graph.facebook.com/v22.0/${waba_id}/subscribed_apps`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${systemUserToken}`,
            'Content-Type': 'application/json'
          }
        });
        const subscribeData = await subscribeRes.json();
        app.log.info(`[connect-whatsapp-cloud] Subscribed apps result: ${JSON.stringify(subscribeData)}`);
      } catch (err) {
        app.log.warn(`[connect-whatsapp-cloud] Failed to subscribe apps automatically: ${err}`);
      }

      // Return the final data payload back to the frontend!
      reply.status(200).send({
        success: true,
        message: "Conectado com sucesso via Hosted Embedded Signup.",
        data: {
          wabaId: waba_id,
          wabaBusinessAccountId: waba_business_account_id,
          wabaPhoneNumberId: phoneNumberId,
          wabaAccessToken: businessToken,
          phoneNumber: phoneNumberDisplay
        }
      });

    } catch (error) {
      app.log.error(error, "[connect-whatsapp-cloud] Error in connect-whatsapp-cloud flow");
      reply.status(500).send({
        success: false,
        message: `Erro interno: ${error}`
      });
    }
  });

  // Update prompt endpoint
  app.post("/agents/update-prompt", {
    schema: {
      summary: "Update agent prompt",
      tags: ["Agent"],
      body: {
        type: "object",
        properties: {
          agent_id: { type: "string" },
          prompt: { type: "string" },
          action: { type: "string" }
        },
        required: ["agent_id", "prompt"]
      }
    },
  }, async (request, reply) => {
    const body = request.body as any;
    const { agent_id, prompt } = body;

    if (!agent_id || !prompt) {
      return reply.status(400).send({
        success: false,
        message: "Agent ID and prompt are required"
      });
    }

    try {
      const id = ID.from(agent_id);

      // Update in DB and potentially cache depending on repository implementation
      // The setPrompt method in AgentRepositoryImpl updates the DB
      // The CachedAgentRepository should handle cache invalidation/update
      await repository.setPrompt(id, prompt);

      return reply.status(200).send({
        success: true,
        message: "Prompt updated successfully"
      });
    } catch (error) {
      app.log.error(error, "Error updating prompt");
      return reply.status(500).send({
        success: false,
        message: `Error updating prompt: ${error}`
      });
    }
  });

  // n8n compatible check-status endpoint
  app.post("/agents/check-status", {
    schema: {
      summary: "Check agent connection status (n8n compatible)",
      tags: ["Agent"],
    },
  }, async (request, reply) => {
    const body = request.body as any;
    const { agent_id } = body;

    if (!agent_id) {
      return reply.status(400).send([{ success: false, message: "ID do agente não fornecido" }]);
    }

    try {
      // 1. Get Agent from Supabase
      const agent = await repository.findById(ID.from(agent_id));
      if (!agent) {
        return reply.status(404).send([{ success: false, message: "Agente não encontrado" }]);
      }

      const instanceName = agent.instanceName || agent.id.toString();
      const evoService = new EvolutionApiService({
        apiKey: Deno.env.get("EVOLUTION_API_KEY")!,
        url: Deno.env.get("EVOLUTION_API_URL")!
      });

      // 2. Check Instance State in Evolution API
      let connectionState;
      try {
        connectionState = await evoService.checkInstanceState(instanceName);
      } catch (e) {
        return reply.status(200).send([
          {
            success: true,
            agent_id: agent_id,
            status: "disconnected"
          }
        ]);
      }

      const isConnected = connectionState?.instance?.state === "open";

      if (isConnected) {
        // 3. Fetch Instance details to get the connected number
        let phone = "";
        try {
          const instances = await evoService.fetchInstance(instanceName);
          const instanceData = Array.isArray(instances)
            ? instances.find((i: any) => i.instanceName === instanceName)
            : instances;

          const rawJid = instanceData?.owner || instanceData?.instance?.owner;
          if (rawJid) {
            phone = rawJid.split('@')[0];

            // 4. Update Agent in DB
            await repository.update(agent.id, {
              phoneNumber: phone,
              status: "active"
            });
          }
        } catch (fetchErr) {
          app.log.warn(`Erro ao buscar detalhes da instância ou atualizar DB: ${fetchErr}`);
        }

        return reply.status(200).send([
          {
            success: true,
            agent_id: agent_id,
            status: "connected",
            number: phone || agent.phoneNumber
          }
        ]);
      } else {
        return reply.status(200).send([
          {
            success: true,
            agent_id: agent_id,
            status: "disconnected"
          }
        ]);
      }

    } catch (error) {
      app.log.error(error, "Error in check-status flow");
      reply.status(500).send([{
        success: false,
        message: `Erro interno: ${error}`
      }]);
    }
  });

};
