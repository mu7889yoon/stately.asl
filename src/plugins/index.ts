export { PluginRegistry, defaultRetry, defaultCatch, buildSdkArn } from "./interface.js";
export { dynamodbPlugin } from "./dynamodb.js";
export { s3Plugin } from "./s3.js";
export { sqsPlugin } from "./sqs.js";
export { snsPlugin } from "./sns.js";

import { PluginRegistry } from "./interface.js";
import { dynamodbPlugin } from "./dynamodb.js";
import { s3Plugin } from "./s3.js";
import { sqsPlugin } from "./sqs.js";
import { snsPlugin } from "./sns.js";

/**
 * Creates the default plugin registry with all built-in plugins
 */
export function createDefaultRegistry(): PluginRegistry {
  const registry = new PluginRegistry();
  registry.register(dynamodbPlugin);
  registry.register(s3Plugin);
  registry.register(sqsPlugin);
  registry.register(snsPlugin);
  return registry;
}

/**
 * Default plugin registry instance
 */
export const defaultRegistry = createDefaultRegistry();
