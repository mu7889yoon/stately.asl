/**
 * 複数サービスの連携
 * DynamoDB → S3 → SNS の順で処理
 */
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

export async function handler(
  TableName: string,
  Key: Record<string, any>,
  Bucket: string,
  S3Key: string,
  TopicArn: string
) {
  const ddb = new DynamoDBClient({});
  const s3 = new S3Client({});
  const sns = new SNSClient({});

  // 1. DynamoDBからデータを取得
  const item = await ddb.send(new GetItemCommand({ TableName, Key }));

  // 2. S3にバックアップを保存
  await s3.send(new PutObjectCommand({
    Bucket,
    Key: S3Key,
    Body: JSON.stringify(item.Item),
  }));

  // 3. SNSで通知を送信
  await sns.send(new PublishCommand({
    TopicArn,
    Message: "Backup completed",
    Subject: "DynamoDB Backup",
  }));

  return { success: true };
}
