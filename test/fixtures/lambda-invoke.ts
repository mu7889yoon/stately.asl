import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

export async function handler(FunctionName: string, Payload: Record<string, unknown>) {
  const lambda = new LambdaClient({});
  const result = await lambda.send(new InvokeCommand({ FunctionName, Payload }));
  return result;
}
