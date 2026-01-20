import type { ServicePlugin } from "../types.js";

/**
 * DynamoDB plugin for AWS SDK v3 operations
 */
export const dynamodbPlugin: ServicePlugin = {
  serviceName: "dynamodb",
  clientNames: ["DynamoDBClient"],
  // No overrides needed - all operations follow standard naming convention
};
