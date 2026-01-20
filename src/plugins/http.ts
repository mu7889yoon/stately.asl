import type { ServicePlugin } from "../types.js";

/**
 * HTTP plugin for Step Functions HTTP:Invoke integration
 * Supports Node.js https module patterns
 */
export const httpPlugin: ServicePlugin = {
  serviceName: "http",
  clientNames: [],
};
