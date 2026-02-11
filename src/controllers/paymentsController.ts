import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import z from "zod/v4";

const PaymentProcessSchema = z.object({
    metodo: z.enum(["mpesa", "emola"]),
    numero_celular: z.string(),
});

type PaymentProcessBody = z.infer<typeof PaymentProcessSchema>;

export const paymentsController = async (app: FastifyInstance) => {
    app.post<{ Body: PaymentProcessBody }>("/process", {
        schema: {
            summary: "Process payment",
            tags: ["Payments"],
            body: {
                type: "object",
                properties: {
                    metodo: { type: "string", enum: ["mpesa", "emola"] },
                    numero_celular: { type: "string" },
                },
                required: ["metodo", "numero_celular"],
            },
            response: {
                200: {
                    type: "object",
                    properties: {
                        success: { type: "boolean" },
                        message: { type: "string" },
                        plan_end_date: { type: "string", format: "date-time" },
                    },
                },
                400: {
                    type: "object",
                    properties: { success: { type: "boolean" }, error: { type: "string" } },
                },
                500: {
                    type: "object",
                    properties: { success: { type: "boolean" }, error: { type: "string" } },
                },
            },
        },
    }, async (request: FastifyRequest<{ Body: PaymentProcessBody }>, reply: FastifyReply) => {
        const parsedBody = PaymentProcessSchema.safeParse(request.body);

        if (!parsedBody.success) {
            return reply.status(400).send({
                success: false,
                error: "Invalid data",
            });
        }

        try {
            // TODO: Process payment via PayMoz, update Supabase, send email
            // const { metodo, numero_celular } = parsedBody.data;

            // Mock response for now
            const planEndDate = new Date();
            planEndDate.setMonth(planEndDate.getMonth() + 1);

            reply.status(200).send({
                success: true,
                message: "Payment processed successfully",
                plan_end_date: planEndDate.toISOString(),
            });
        } catch (error) {
            request.log.error(error, "Error processing payment");
            reply.status(500).send({ success: false, error: "Internal Server Error" });
        }
    });
};
