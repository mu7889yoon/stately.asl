/**
 * シンプルなDynamoDB操作
 * 単一のPutItem → 単一のTask状態
 */
import { DynamoDBClient, PutItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";

export async function handler(TableName: string, Key: Record<string, any>, Item: Record<string, any>) {
  const client = new DynamoDBClient({});

  // アイテムを保存
  await client.send(new PutItemCommand({ TableName, Item }));

  // アイテムを取得
  const result = await client.send(new GetItemCommand({ TableName, Key }));

  return result;
}
