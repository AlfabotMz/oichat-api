import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import z from "zod/v4";

const BusinessFormSchema = z.object({
    name: z.string(),
    businessName: z.string(),
    employees: z.string(),
    budget: z.string(),
});

type BusinessFormBody = z.infer<typeof BusinessFormSchema>;

export const businessFormController = async (app: FastifyInstance) => {
    app.post<{ Body: BusinessFormBody }>("/", {
        schema: {
            summary: "Submit business plan interest form",
            tags: ["Business"],
            body: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    businessName: { type: "string" },
                    employees: { type: "string" },
                    budget: { type: "string" },
                },
                required: ["name", "businessName", "employees", "budget"],
            },
            response: {
                200: {
                    type: "object",
                    properties: { success: { type: "boolean" } },
                },
                500: {
                    type: "object",
                    properties: { error: { type: "string" } },
                },
            },
        },
    }, async (request: FastifyRequest<{ Body: BusinessFormBody }>, reply: FastifyReply) => {
        const parsedBody = BusinessFormSchema.safeParse(request.body);

        if (!parsedBody.success) {
            return reply.status(400).send({
                error: "Invalid data",
                details: z.treeifyError(parsedBody.error),
            });
        }

        try {
            // TODO: Forward data to n8n webhook
            // const { name, businessName, employees, budget } = parsedBody.data;
            // await axios.post(process.env.N8N_BUSINESS_FORM_WEBHOOK!, { ... });

            reply.status(200).send({ success: true });
        } catch (error) {
            request.log.error(error, "Error submitting business form");
            reply.status(500).send({ error: "Internal Server Error" });
        }
    });
};
