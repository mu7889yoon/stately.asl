export async function handler(endpoint: string) {
  return await (await fetch(endpoint)).json();
}
