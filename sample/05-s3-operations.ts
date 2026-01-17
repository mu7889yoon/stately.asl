/**
 * S3操作
 * オブジェクトの取得と保存
 */
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

export async function handler(Bucket: string, Key: string, Body: string) {
  const client = new S3Client({});

  // オブジェクトを保存
  await client.send(new PutObjectCommand({ Bucket, Key, Body }));

  // オブジェクトを取得
  const result = await client.send(new GetObjectCommand({ Bucket, Key }));

  return result;
}
