/**
 * 並列操作（Promise.all）
 * 複数のDynamoDB操作を並列実行 → Parallel状態
 */
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

export async function handler(TableName: string, keys: Record<string, any>[]) {
  const client = new DynamoDBClient({});

  // 複数のアイテムを並列で取得
  const results = await Promise.all([
    client.send(new GetItemCommand({ TableName, Key: keys[0] })),
    client.send(new GetItemCommand({ TableName, Key: keys[1] })),
    client.send(new GetItemCommand({ TableName, Key: keys[2] })),
  ]);

  return results;
}
