import {
  DynamoDBClient as DatabaseClient,
  PutItemCommand as Put,
} from "@aws-sdk/client-dynamodb";

export async function handler(
  TableName: string,
  Item: Record<string, unknown>,
) {
  const client = new DatabaseClient({});
  const result = await client.send(new Put({ TableName, Item }));
  return result;
}
