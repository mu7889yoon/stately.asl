import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

export async function handler(TableName: string, items: Record<string, any>[]) {
  const ddb = new DynamoDBClient({});
  // Parallel: Promise.all
  await Promise.all(
    items.map((Item) => ddb.send(new PutItemCommand({ TableName, Item })))
  );

  // Map: for-of
  for (const Item of items) {
    await ddb.send(new PutItemCommand({ TableName, Item }));
  }

  // Try/Catch: Catch相当
  try {
    await ddb.send(new PutItemCommand({ TableName, Item: items[0] }));
  } catch (e) {
    return { ok: false };
  }

  return { ok: true };
}

