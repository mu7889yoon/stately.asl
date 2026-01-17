/**
 * SQS操作
 * メッセージの送信と受信
 */
import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";

export async function handler(QueueUrl: string, MessageBody: string) {
  const client = new SQSClient({});

  // メッセージを送信
  await client.send(new SendMessageCommand({ QueueUrl, MessageBody }));

  // メッセージを受信
  const received = await client.send(new ReceiveMessageCommand({ QueueUrl }));

  return received;
}
