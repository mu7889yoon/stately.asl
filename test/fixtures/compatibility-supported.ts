import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

export async function handler(
  TableName: string,
  items: Record<string, unknown>[],
  enabled: boolean,
  endpoint: string,
) {
  const client = new DynamoDBClient({});

  await fetch(endpoint);
  await Promise.all([
    client.send(new PutItemCommand({ TableName, Item: items[0] })),
    client.send(new PutItemCommand({ TableName, Item: items[1] })),
  ]);

  for (const Item of items) {
    await client.send(new PutItemCommand({ TableName, Item }));
  }

  if (enabled === true) {
    await client.send(new PutItemCommand({ TableName, Item: items[0] }));
  } else {
    try {
      await client.send(new PutItemCommand({ TableName, Item: items[1] }));
    } catch {
      await client.send(new PutItemCommand({ TableName, Item: items[2] }));
    }
  }
}
