import { FastifyInstance } from "fastify";
import { agentController } from "../controllers/agentController.ts";
import { webhookController } from "../controllers/webhookEvolutionController.ts";
import { webhookWhatsappCloudController } from "../controllers/webhookWhatsappCloudController.ts";

import { logController } from "../controllers/logController.ts";

// Função principal de roteamento que registra os controladores
export default async function router(app: FastifyInstance) {
    app.register(agentController, { prefix: "/api" })
    app.register(webhookController, { prefix: "/webhook" })
    app.register(webhookWhatsappCloudController, { prefix: "/webhook-cloud" })

    app.register(logController)

    app.get("/health", async (_request, reply) => {
        reply.status(200).send({
            status: "ok",
            timestamp: new Date().toISOString(),
            uptime: Math.floor(performance.now() / 1000)
        });
    });
}
