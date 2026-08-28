import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

declare function normalize(value: string | undefined): string;

export async function handler(
  TableName: string,
  Key: Record<string, unknown>,
  Item: Record<string, unknown>,
  index: number,
) {
  const client = new DynamoDBClient({});
  const result = await client.send(new GetItemCommand({ TableName, Key }));

  if (normalize(result.Item?.status?.S) === "ACTIVE") {
    await client.send(new PutItemCommand({ TableName, Item }));
  }

  if (result.Item?.values[index] === "ACTIVE") {
    await client.send(new PutItemCommand({ TableName, Item }));
  }

  if (new Date() < Date.now()) {
    await client.send(new PutItemCommand({ TableName, Item }));
  }
}
