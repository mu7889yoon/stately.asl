import https from "https";

export async function handler(endpoint: string) {
  https.get(endpoint, (res) => {
    console.log(res.statusCode);
  });
}
