import type { ServicePlugin, RetryConfig } from "../types.js";

/**
 * Default retry configuration for AWS SDK integrations
 */
export const defaultRetry: RetryConfig[] = [
  {
    ErrorEquals: ["States.ALL"],
    IntervalSeconds: 2,
    MaxAttempts: 3,
    BackoffRate: 2,
  },
];

/**
 * Default catch configuration for error handling
 */
export const defaultCatch = [
  {
    ErrorEquals: ["States.ALL"],
    ResultPath: "$.error",
    Next: "__ErrorHandled__",
  },
];

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
