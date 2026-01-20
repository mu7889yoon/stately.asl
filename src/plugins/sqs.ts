import type { ServicePlugin } from "../types.js";

/**
 * SQS plugin for AWS SDK v3 operations
 */
export const sqsPlugin: ServicePlugin = {
  serviceName: "sqs",
  clientNames: ["SQSClient"],
  // No overrides needed - all operations follow standard naming convention
};
