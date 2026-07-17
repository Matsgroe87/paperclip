import { z } from "zod";
import { agentAdapterTypeSchema } from "../adapter-type.js";

const profileConfigSchema = z.record(z.string(), z.unknown());

export const createRuntimeProfileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  adapterType: agentAdapterTypeSchema,
  adapterConfig: profileConfigSchema.optional().default({}),
  runtimeConfig: profileConfigSchema.optional().default({}),
});

export const updateRuntimeProfileSchema = createRuntimeProfileSchema.partial();

export type CreateRuntimeProfile = z.infer<typeof createRuntimeProfileSchema>;
export type UpdateRuntimeProfile = z.infer<typeof updateRuntimeProfileSchema>;
