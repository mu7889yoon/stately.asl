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
) {
  const client = new DynamoDBClient({});
  const result = await client.send(new GetItemCommand({ TableName, Key }));

  if (
    result.Item?.status?.S === "ACTIVE" &&
    Number(result.Item?.expiresAt?.N) <= Date.now()
  ) {
    await client.send(new PutItemCommand({ TableName, Item }));
  } else {
    await client.send(new DeleteItemCommand({ TableName, Key }));
  }

  if (
    Date.parse(result.Item?.updatedAt?.S) > Date.now() ||
    result.Item === undefined
  ) {
    await client.send(new PutItemCommand({ TableName, Item }));
  }

  if (result.Item?.status?.S !== "DISABLED") {
    await client.send(new PutItemCommand({ TableName, Item }));
  }

  if (result.Item == null) {
    await client.send(new DeleteItemCommand({ TableName, Key }));
  }

  if (!(result.Item?.status?.S === "BLOCKED")) {
    await client.send(new PutItemCommand({ TableName, Item }));
  }

  if (String(result.Item?.code?.N) === "42") {
    await client.send(new PutItemCommand({ TableName, Item }));
  }
}
