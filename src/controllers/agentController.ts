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
  app.post("/create-agent", {
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
  app.post("/delete-agent", {
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

  app.post("/connect-whatsapp", {
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
      const agent = await repository.findById(ID.from(agent_id));
      if (!agent) {
        return reply.status(404).send({ success: false, message: "Agente não encontrado" });
      }

      const instanceName = agent.instanceName || agent.id.toString();
      const evoService = new EvolutionApiService({
        apiKey: Deno.env.get("EVOLUTION_API_KEY")!,
        url: Deno.env.get("EVOLUTION_API_URL")!
      });

      // 2. Check Instance State
      let connectionState;
      try {
        connectionState = await evoService.checkInstanceState(instanceName);
      } catch (e) {
        app.log.warn(`Instance ${instanceName} might not exist yet: ${e}`);
        // If it doesn't exist, create it
        try {
          await evoService.createInstace({ name: instanceName, id: agent.id });
        } catch (createErr) {
          return reply.status(500).send({ success: false, message: `Erro ao criar instância: ${createErr}` });
        }
      }

      // 3. If connected, disconnect (logout)
      if (connectionState?.instance?.state === "open") {
        try {
          await evoService.logoutInstance(instanceName);
        } catch (logoutErr) {
          app.log.warn(`Erro ao desconectar instância ${instanceName}: ${logoutErr}`);
        }
      }

      // 4. Connect and get QR Code
      try {
        const connectData = await evoService.connectInstaceWithCode(instanceName);

        reply.status(200).send({
          success: true,
          qr: connectData.base64 || connectData.code, // Evolution returns base64 for QR image
          status: "pending",
          message: "Escaneie o QR code para conectar seu número de WhatsApp."
        });
      } catch (connectErr) {
        reply.status(500).send({ success: false, message: `Erro ao gerar QR code: ${connectErr}` });
      }

    } catch (error) {
      app.log.error(error, "Error in connect-whatsapp flow");
      reply.status(500).send({
        success: false,
        message: `Erro interno: ${error}`
      });
    }
  });

  // n8n compatible check-status endpoint
  app.post("/check-status", {
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
