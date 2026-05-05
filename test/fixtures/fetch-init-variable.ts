export async function handler(endpoint: string) {
  const init = {
    method: "POST",
  };

  await fetch(endpoint, init);
}
