/**
 * エラーハンドリング（try/catch）
 * DynamoDB操作のエラーをキャッチ → Catch設定
 */
import { DynamoDBClient, PutItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";

export async function handler(TableName: string, Key: Record<string, any>, Item: Record<string, any>) {
  const client = new DynamoDBClient({});

  try {
    // アイテムを保存（失敗する可能性あり）
    await client.send(new PutItemCommand({ TableName, Item }));

    // 保存したアイテムを取得
    const result = await client.send(new GetItemCommand({ TableName, Key }));

    return { success: true, item: result.Item };
  } catch (error) {
    // エラー時の処理
    return { success: false, error: "Failed to process item" };
  }
}
