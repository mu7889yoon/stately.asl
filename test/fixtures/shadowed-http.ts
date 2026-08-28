function fetch(endpoint: string) {
  return endpoint;
}

export async function handler(endpoint: string) {
  await fetch(endpoint);
}
