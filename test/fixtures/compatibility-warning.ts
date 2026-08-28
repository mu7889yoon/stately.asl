export async function handler(endpoint: string) {
  await fetch(endpoint, { cache: "no-store" });
}
