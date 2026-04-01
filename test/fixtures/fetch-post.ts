export async function handler(apiUrl: string, payload: { userId: string }) {
  await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  });
}
