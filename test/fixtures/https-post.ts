import https from "https";

export async function handler(apiUrl: string, data: { userId: string }) {
  https.request(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  }, (res) => {
    console.log(res.statusCode);
  });
}
