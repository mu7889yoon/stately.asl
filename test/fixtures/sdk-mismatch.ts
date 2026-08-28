import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutObjectCommand } from "@aws-sdk/client-s3";

export async function handler(Bucket: string, Key: string) {
  const client = new DynamoDBClient({});
  await client.send(new PutObjectCommand({ Bucket, Key }));
}
