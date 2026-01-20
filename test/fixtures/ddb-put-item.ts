import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

export async function handler(TableName: string, Item: Record<string, unknown>) {
  const ddb = new DynamoDBClient({});
  const res = await ddb.send(new PutItemCommand({ TableName, Item }));
  return res;
}

