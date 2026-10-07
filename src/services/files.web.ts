import * as DocumentPicker from 'expo-document-picker';

/** Downloads the file through the browser. */
export async function saveFile(name: string, contents: string, mimeType: string, _uti: string): Promise<boolean> {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export async function pickTextFile(): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'] });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  if (asset.file) return asset.file.text();
  return (await fetch(asset.uri)).text();
}
