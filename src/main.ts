import Fastify from 'fastify';
import router from "./http/routers.ts";
import { initializeRedis } from './db/redisClient.ts';
import swagger from "@fastify/swagger";

import swaggerUi from "@fastify/swagger-ui";

const app = Fastify({
  logger: true
});



// Register Swagger
await app.register(swagger, {
  openapi: {
    info: {
      title: "OiChat MVP API",
      description: "API para gerenciar agentes e conversas do OiChat.",
      version: "0.1.0",
    },
    components: {
      schemas: {
      }
    },    
    tags: [
      { name: 'Agent', description: 'Agent management endpoints' },
      { name: 'Conversation', description: 'Conversation and memory endpoints' }
    ]
  },
});

// Register Swagger UI
await app.register(swaggerUi, {
  routePrefix: "/docs",
});

// Declare a route
app.get('/', function (_request, reply) {
  reply.status(200).send({ ok: true })
})

app.register(router)

const start = async () => {
    try {
      await initializeRedis();
      await app.listen({ port: 3000, host: '0.0.0.0' });
      app.log.info(`Swagger UI available at http://localhost:3000/docs`);
    } catch (err) {
      app.log.error(err)
      Deno.exit(1) 
    }
  }


if (import.meta.main) {
    start()
}
  