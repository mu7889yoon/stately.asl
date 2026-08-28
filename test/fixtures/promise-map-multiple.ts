import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

export async function handler(
  TableName: string,
  items: Array<{ Key: Record<string, unknown>; Item: Record<string, unknown> }>,
) {
  const client = new DynamoDBClient({});
  const results = await Promise.all(
    items.map(async (entry) => {
      await client.send(new PutItemCommand({ TableName, Item: entry.Item }));
      const result = await client.send(
        new GetItemCommand({ TableName, Key: entry.Key }),
      );
      return result;
    }),
  );
  return results;
}
