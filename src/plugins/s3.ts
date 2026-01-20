import type { ServicePlugin } from "../types.js";

/**
 * S3 plugin for AWS SDK v3 operations
 */
export const s3Plugin: ServicePlugin = {
  serviceName: "s3",
  clientNames: ["S3Client"],
  // No overrides needed - all operations follow standard naming convention
};
