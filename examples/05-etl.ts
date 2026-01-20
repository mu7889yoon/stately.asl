/**
 * S3からCSVを取得してDynamoDBに登録するETL処理
 * S3 GetObject → CSVパース → forループでDynamoDB PutItem
 */
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

export async function handler(
  bucketName: string,
  objectKey: string,
  tableName: string
) {
  const s3Client = new S3Client({});
  const dynamoClient = new DynamoDBClient({});

  // S3からCSVファイルを取得
  const s3Response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    })
  );

  // CSVをパース（ヘッダー行 + データ行を想定）
  const csvText = await s3Response.Body?.transformToString();
  const lines = csvText?.split("\n").filter((line) => line.trim()) || [];
  const headers = lines[0].split(",");
  const dataRows = lines.slice(1);

  // 各行をDynamoDBに登録
  const results = [];
  for (const row of dataRows) {
    const values = row.split(",");
    const item: Record<string, { S: string }> = {};

    for (let i = 0; i < headers.length; i++) {
      item[headers[i].trim()] = { S: values[i]?.trim() || "" };
    }

    const result = await dynamoClient.send(
      new PutItemCommand({
        TableName: tableName,
        Item: item,
      })
    );
    results.push(result);
  }

  return { processedCount: results.length };
}
