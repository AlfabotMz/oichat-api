import Fastify from 'fastify';
import router from "./http/routers.ts";
import { initializeRedis } from './db/redisClient.ts';
import swagger from "@fastify/swagger";

import swaggerUi from "@fastify/swagger-ui";

const app = Fastify({
  logger: true
});



// Registrar Swagger
await app.register(swagger, {
  openapi: {
    info: {
      title: "OiChat MVP API",
      description: "API para gerenciar agentes e conversas do OiChat.",
      version: "0.1.0",
    },
    components: {
      schemas: {}
    },
    tags: [
      { name: 'Agent', description: 'Agent management endpoints' },
      { name: 'Conversation', description: 'Conversation and memory endpoints' }
    ]
  },
});

// Registrar Swagger UI
await app.register(swaggerUi, {
  routePrefix: "/docs",
  theme: { title: 'OiChat API' }
});

app.get('/', function (_request, reply) {
  reply.status(200).send({ ok: true })
})

import { notificationService } from "./services/notificationService.ts";

app.setErrorHandler(async (error, request, reply) => {
  app.log.error(error);

  // Somente enviar alerta para erros 500 (ou erros inesperados)
  const statusCode = error.statusCode || 500;

  if (statusCode >= 500) {
    await notificationService.sendErrorAlert(error, {
      method: request.method,
      url: request.url,
      body: request.body
    });
  }

  reply.status(statusCode).send({
    success: false,
    message: statusCode >= 500 ? "Internal Server Error" : error.message,
    code: error.code
  });
});

app.register(router)

const start = async () => {
  try {
    await initializeRedis();
    await app.listen({ port: 3001, host: '0.0.0.0' });
    app.log.info(`Swagger UI available at http://localhost:3000/docs`);
  } catch (err) {
    app.log.error(err)
    Deno.exit(1)
  }
}


if (import.meta.main) {
  start()
}
