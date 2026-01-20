import https from "https";

export async function handler(apiUrl: string, _data: { userId: string }) {
  https.request(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  }, (res) => {
    console.log(res.statusCode);
  });
}
