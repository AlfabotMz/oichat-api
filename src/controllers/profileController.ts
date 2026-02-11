import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import z from "zod/v4";

const ProfileUpdateSchema = z.object({
    businessName: z.string(),
    whatsapp: z.string(),
    companySize: z.string(),
    goal: z.string(),
    source: z.string(),
});

type ProfileUpdateBody = z.infer<typeof ProfileUpdateSchema>;

export const profileController = async (app: FastifyInstance) => {
    app.post<{ Body: ProfileUpdateBody }>("/update", {
        schema: {
            summary: "Update user profile",
            tags: ["Profile"],
            body: {
                type: "object",
                properties: {
                    businessName: { type: "string" },
                    whatsapp: { type: "string" },
                    companySize: { type: "string" },
                    goal: { type: "string" },
                    source: { type: "string" },
                },
                required: ["businessName", "whatsapp", "companySize", "goal", "source"],
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
    }, async (request: FastifyRequest<{ Body: ProfileUpdateBody }>, reply: FastifyReply) => {
        const parsedBody = ProfileUpdateSchema.safeParse(request.body);

        if (!parsedBody.success) {
            return reply.status(400).send({
                success: false,
                error: "Invalid data",
            });
        }

        try {
            // TODO: Update user profile in Supabase
            // const { businessName, whatsapp, companySize, goal, source } = parsedBody.data;

            reply.status(200).send({ success: true });
        } catch (error) {
            request.log.error(error, "Error updating profile");
            reply.status(500).send({ success: false, error: "Internal Server Error" });
        }
    });
};
