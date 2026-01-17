import type { ServicePlugin } from "../types.js";
import { defaultRetry } from "./interface.js";

/**
 * SNS plugin for AWS SDK v3 operations
 */
export const snsPlugin: ServicePlugin = {
  serviceName: "sns",
  clientNames: ["SNSClient"],
  operations: {
    PublishCommand: {
      aslOperation: "publish",
      retry: defaultRetry,
    },
    PublishBatchCommand: {
      aslOperation: "publishBatch",
      retry: defaultRetry,
    },
    SubscribeCommand: {
      aslOperation: "subscribe",
      retry: defaultRetry,
    },
    UnsubscribeCommand: {
      aslOperation: "unsubscribe",
      retry: defaultRetry,
    },
    CreateTopicCommand: {
      aslOperation: "createTopic",
      retry: defaultRetry,
    },
    DeleteTopicCommand: {
      aslOperation: "deleteTopic",
      retry: defaultRetry,
    },
    ListTopicsCommand: {
      aslOperation: "listTopics",
      retry: defaultRetry,
    },
    ListSubscriptionsByTopicCommand: {
      aslOperation: "listSubscriptionsByTopic",
      retry: defaultRetry,
    },
    GetTopicAttributesCommand: {
      aslOperation: "getTopicAttributes",
      retry: defaultRetry,
    },
    SetTopicAttributesCommand: {
      aslOperation: "setTopicAttributes",
      retry: defaultRetry,
    },
  },
};
