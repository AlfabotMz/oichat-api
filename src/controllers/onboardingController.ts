import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import z from "zod/v4";

// Schema accepts any object as per "Any data from the onboarding survey"
const OnboardingSchema = z.record(z.any());

type OnboardingBody = z.infer<typeof OnboardingSchema>;

export const onboardingController = async (app: FastifyInstance) => {
    app.post<{ Body: OnboardingBody }>("/", {
        schema: {
            summary: "Forward onboarding survey data",
            tags: ["Onboarding"],
            body: {
                type: "object",
                additionalProperties: true,
            },
            response: {
                200: {
                    type: "object",
                    properties: { success: { type: "boolean" } },
                },
                401: {
                    type: "object",
                    properties: { success: { type: "boolean" }, error: { type: "string" } },
                },
                500: {
                    type: "object",
                    properties: { success: { type: "boolean" }, error: { type: "string" } },
                },
            },
        },
    }, async (request: FastifyRequest<{ Body: OnboardingBody }>, reply: FastifyReply) => {
        const parsedBody = OnboardingSchema.safeParse(request.body);

        if (!parsedBody.success) {
            return reply.status(400).send({
                success: false,
                error: "Invalid data",
            });
        }

        try {
            // TODO: Forward data to n8n webhook
            // const data = parsedBody.data;
            // await axios.post(process.env.N8N_ONBOARDING_WEBHOOK!, { ...data, userId: ..., email: ... });

            reply.status(200).send({ success: true });
        } catch (error) {
            request.log.error(error, "Error forwarding onboarding data");
            reply.status(500).send({ success: false, error: "Internal Server Error" });
        }
    });
};
