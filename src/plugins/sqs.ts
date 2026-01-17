import type { ServicePlugin } from "../types.js";
import { defaultRetry } from "./interface.js";

/**
 * SQS plugin for AWS SDK v3 operations
 */
export const sqsPlugin: ServicePlugin = {
  serviceName: "sqs",
  clientNames: ["SQSClient"],
  operations: {
    SendMessageCommand: {
      aslOperation: "sendMessage",
      retry: defaultRetry,
    },
    ReceiveMessageCommand: {
      aslOperation: "receiveMessage",
      retry: defaultRetry,
    },
    DeleteMessageCommand: {
      aslOperation: "deleteMessage",
      retry: defaultRetry,
    },
    SendMessageBatchCommand: {
      aslOperation: "sendMessageBatch",
      retry: defaultRetry,
    },
    DeleteMessageBatchCommand: {
      aslOperation: "deleteMessageBatch",
      retry: defaultRetry,
    },
    GetQueueAttributesCommand: {
      aslOperation: "getQueueAttributes",
      retry: defaultRetry,
    },
    SetQueueAttributesCommand: {
      aslOperation: "setQueueAttributes",
      retry: defaultRetry,
    },
    GetQueueUrlCommand: {
      aslOperation: "getQueueUrl",
      retry: defaultRetry,
    },
    CreateQueueCommand: {
      aslOperation: "createQueue",
      retry: defaultRetry,
    },
    DeleteQueueCommand: {
      aslOperation: "deleteQueue",
      retry: defaultRetry,
    },
    PurgeQueueCommand: {
      aslOperation: "purgeQueue",
      retry: defaultRetry,
    },
  },
};
