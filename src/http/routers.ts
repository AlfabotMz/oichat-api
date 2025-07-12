import { FastifyInstance } from "fastify";
import { agentController } from "../controllers/agentController.ts";
import { webhookController } from "../controllers/webhookEvolutionController.ts";
import { whatsappController } from "../controllers/whatsappController.ts";

export default async function router(app: FastifyInstance) {
    app.register(agentController, { prefix: "/api/agent"})
    app.register(webhookController, {prefix: "/api/webhook"})
    app.register(whatsappController, {prefix: "/api/whatsapp"})
}
