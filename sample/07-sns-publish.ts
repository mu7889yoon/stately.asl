/**
 * SNS操作
 * トピックへのメッセージ発行
 */
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

export async function handler(TopicArn: string, Message: string, Subject: string) {
  const client = new SNSClient({});

  // メッセージを発行
  const result = await client.send(new PublishCommand({ TopicArn, Message, Subject }));

  return { messageId: result.MessageId };
}
