import type { ServicePlugin } from "../types.js";

/**
 * Derives ASL operation name from SDK command name.
 * Removes "Command" suffix and converts PascalCase to camelCase.
 *
 * @example
 * deriveAslOperation("PutItemCommand") // "putItem"
 * deriveAslOperation("ScanCommand") // "scan"
 * deriveAslOperation("BatchWriteItemCommand") // "batchWriteItem"
 */
export function deriveAslOperation(commandName: string): string {
  const withoutSuffix = commandName.endsWith("Command")
    ? commandName.slice(0, -7)
    : commandName;
  return withoutSuffix.charAt(0).toLowerCase() + withoutSuffix.slice(1);
}

/**
 * Builds an AWS SDK integration ARN for Step Functions
 */
export function buildSdkArn(service: string, operation: string): string {
  return `arn:aws:states:::aws-sdk:${service}:${operation}`;
}

/**
 * Plugin registry for managing service plugins
 */
export class PluginRegistry {
  private plugins: Map<string, ServicePlugin> = new Map();
  private clientToPlugin: Map<string, ServicePlugin> = new Map();

  register(plugin: ServicePlugin): void {
    this.plugins.set(plugin.serviceName, plugin);
    for (const clientName of plugin.clientNames) {
      this.clientToPlugin.set(clientName, plugin);
    }
  }

  getByService(serviceName: string): ServicePlugin | undefined {
    return this.plugins.get(serviceName);
  }

  getByClientName(clientName: string): ServicePlugin | undefined {
    return this.clientToPlugin.get(clientName);
  }

  getAll(): ServicePlugin[] {
    return Array.from(this.plugins.values());
  }
}
