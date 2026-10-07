export async function readAssetBytes(uri: string): Promise<ArrayBuffer> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`Model request failed (${res.status})`);
  return res.arrayBuffer();
}
