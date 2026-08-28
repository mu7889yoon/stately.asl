export async function handler(items: number[]) {
  return items.map((item) => item * 2);
}
