import { FastifyInstance } from "fastify";
import { agentController } from "../controllers/agentController.ts";
import { webhookController } from "../controllers/webhookEvolutionController.ts";

import { businessFormController } from "../controllers/businessFormController.ts";
import { paymentsController } from "../controllers/paymentsController.ts";
import { profileController } from "../controllers/profileController.ts";
import { onboardingController } from "../controllers/onboardingController.ts";

// Função principal de roteamento que registra os controladores
export default async function router(app: FastifyInstance) {
    app.register(agentController, { prefix: "/api" })
    app.register(webhookController, { prefix: "/webhook" })

    app.register(businessFormController, { prefix: "/api/business-form" })
    app.register(paymentsController, { prefix: "/api/payments" })
    app.register(profileController, { prefix: "/api/profile" })
    app.register(onboardingController, { prefix: "/api/onboarding" })

    app.get("/health", async (_request, reply) => {
        reply.status(200).send({
            status: "ok",
            timestamp: new Date().toISOString(),
            uptime: Math.floor(performance.now() / 1000)
        });
    });
}
