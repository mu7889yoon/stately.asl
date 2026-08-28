import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

export async function handler(
  TableName: string,
  Key: Record<string, unknown>,
  Item: Record<string, unknown>,
  items: Record<string, unknown>[],
) {
  const client = new DynamoDBClient({});
  const result = await client.send(new GetItemCommand({ TableName, Key }));

  await Promise.all([
    client.send(new PutItemCommand({ TableName, Item })),
  ]);

  for (const currentItem of items) {
    await client.send(
      new PutItemCommand({ TableName, Item: currentItem }),
    );
  }

  if (result.Item?.status?.S === "ACTIVE") {
    await client.send(new PutItemCommand({ TableName, Item }));
  } else if (result.Item?.status?.S === "PENDING") {
    await client.send(new DeleteItemCommand({ TableName, Key }));
  } else {
    await client.send(new PutItemCommand({ TableName, Item }));
  }

  await client.send(new PutItemCommand({ TableName, Item }));
}
