/**
 * クエリとスキャン
 * DynamoDBのQueryとScanを使用
 */
import { DynamoDBClient, QueryCommand, ScanCommand } from "@aws-sdk/client-dynamodb";

export async function handler(
  TableName: string,
  KeyConditionExpression: string,
  ExpressionAttributeValues: Record<string, any>
) {
  const client = new DynamoDBClient({});

  // クエリで条件に合うアイテムを取得
  const queryResult = await client.send(new QueryCommand({
    TableName,
    KeyConditionExpression,
    ExpressionAttributeValues,
  }));

  // スキャンで全アイテムを取得
  const scanResult = await client.send(new ScanCommand({ TableName }));

  return {
    queryItems: queryResult.Items,
    scanItems: scanResult.Items,
  };
}
