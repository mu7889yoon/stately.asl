import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

export async function unsupportedHelper(input: number[]) {
  const values = input.map((value) => value * 2);
  return values;
}

export async function handler(
  TableName: string,
  Item: Record<string, unknown>,
) {
  const client = new DynamoDBClient({});
  await client.send(new PutItemCommand({ TableName, Item }));
}
