import type { ServicePlugin } from "../types.js";

/**
 * SNS plugin for AWS SDK v3 operations
 */
export const snsPlugin: ServicePlugin = {
  serviceName: "sns",
  clientNames: ["SNSClient"],
  // No overrides needed - all operations follow standard naming convention
};
