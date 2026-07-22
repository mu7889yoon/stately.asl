import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

function normalize(value: Record<string, unknown>) {
  return value;
}

export async function handler(
  TableName: string,
  suffix: string,
  Item: Record<string, unknown>,
  items: Record<string, unknown>[],
  count: number,
) {
  const client = new DynamoDBClient({});

  await client.send(
    new PutItemCommand({
      TableName: TableName + suffix,
      Item: normalize(Item),
    }),
  );

  if (count + 1 === 2) {
    await client.send(new PutItemCommand({ TableName, Item }));
  }

  for (const filteredItem of items.filter(Boolean)) {
    await client.send(new PutItemCommand({ TableName, Item: filteredItem }));
  }

  let _current;
  _current = count;

  while (count > 0) {
    _current = count;
  }
}
