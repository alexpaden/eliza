import { IAgentRuntime } from "@elizaos/core";
import { z } from "zod";

// For now, we don't need any environment variables for basic image detection
export const imageDetectionEnvSchema = z.object({});

export type ImageDetectionConfig = z.infer<typeof imageDetectionEnvSchema>;

export async function validateImageDetectionConfig(
    runtime: IAgentRuntime
): Promise<ImageDetectionConfig> {
    return imageDetectionEnvSchema.parse({});
}
