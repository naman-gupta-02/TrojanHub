// Photo for Tommy: shrunk, then sent inline as a data: URL. The AI service decides where it goes
// (a found item's photo becomes public in Lost & Found; a complaint photo goes to a private
// bucket only staff can see), so the app never uploads it to a public bucket itself.

const MAX_SIDE = 1280;

/** Shrink big phone photos so uploads stay fast. Returns a JPEG blob. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read photo"))), "image/jpeg", 0.8));
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function preparePhoto(file: File): Promise<{ url: string; previewUri: string }> {
  const blob = await shrink(file);
  const previewUri = URL.createObjectURL(blob);
  return { url: await toDataUrl(blob), previewUri };
}
