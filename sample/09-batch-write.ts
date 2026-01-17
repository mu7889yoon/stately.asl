/**
 * バッチ書き込み
 * 複数アイテムを一括でDynamoDBに書き込み
 */
import { DynamoDBClient, BatchWriteItemCommand } from "@aws-sdk/client-dynamodb";

export async function handler(TableName: string, RequestItems: Record<string, any>) {
  const client = new DynamoDBClient({});

  // バッチ書き込み
  const result = await client.send(new BatchWriteItemCommand({ RequestItems }));

  return {
    unprocessedItems: result.UnprocessedItems,
    success: !result.UnprocessedItems || Object.keys(result.UnprocessedItems).length === 0,
  };
}
