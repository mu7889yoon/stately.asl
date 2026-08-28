import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

export async function handler(
  TableName: string,
  item: { id: string },
  items: Record<string, unknown>[],
) {
  const client = new DynamoDBClient({});
  await client.send(
    new PutItemCommand({
      TableName,
      Item: {
        id: item.id,
        first: items[0],
        enabled: true,
        count: 42,
        empty: null,
        label: "fixed",
      },
    }),
  );
}
