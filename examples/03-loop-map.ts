/**
 * ループ処理（for...of）
 * 配列の各要素に対してDynamoDB操作 → Map状態
 */
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

export async function handler(TableName: string, items: Record<string, any>[]) {
  const client = new DynamoDBClient({});

  // 各アイテムを順番に保存（Map状態として変換される）
  for (const Item of items) {
    await client.send(new PutItemCommand({ TableName, Item }));
  }

  return { success: true, count: items.length };
}
