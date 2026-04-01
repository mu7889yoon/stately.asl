export async function handler(endpoint: string) {
  const response = await fetch(endpoint);

  return await response.json();
}
