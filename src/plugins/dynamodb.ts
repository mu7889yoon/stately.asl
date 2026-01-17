import type { ServicePlugin } from "../types.js";
import { defaultRetry } from "./interface.js";

/**
 * DynamoDB plugin for AWS SDK v3 operations
 */
export const dynamodbPlugin: ServicePlugin = {
  serviceName: "dynamodb",
  clientNames: ["DynamoDBClient"],
  operations: {
    PutItemCommand: {
      aslOperation: "putItem",
      retry: defaultRetry,
    },
    GetItemCommand: {
      aslOperation: "getItem",
      retry: defaultRetry,
    },
    UpdateItemCommand: {
      aslOperation: "updateItem",
      retry: defaultRetry,
    },
    DeleteItemCommand: {
      aslOperation: "deleteItem",
      retry: defaultRetry,
    },
    QueryCommand: {
      aslOperation: "query",
      retry: defaultRetry,
    },
    ScanCommand: {
      aslOperation: "scan",
      retry: defaultRetry,
    },
    BatchWriteItemCommand: {
      aslOperation: "batchWriteItem",
      retry: defaultRetry,
    },
    BatchGetItemCommand: {
      aslOperation: "batchGetItem",
      retry: defaultRetry,
    },
    TransactWriteItemsCommand: {
      aslOperation: "transactWriteItems",
      retry: defaultRetry,
    },
    TransactGetItemsCommand: {
      aslOperation: "transactGetItems",
      retry: defaultRetry,
    },
  },
};
