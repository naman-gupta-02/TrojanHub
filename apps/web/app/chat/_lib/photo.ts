// Photo for Tommy: upload to Supabase Storage ("photos" bucket) when logged in, otherwise send
// it inline as a data: URL (the AI service swaps it for a short reference before the LLM sees it).
import { supabase } from "@/lib/supabase";

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
  if (supabase) {
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user.id;
    if (uid) {
      const path = `chat/${uid}/${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("photos").upload(path, blob, { contentType: "image/jpeg" });
      if (!error) return { url: supabase.storage.from("photos").getPublicUrl(path).data.publicUrl, previewUri };
    }
  }
  return { url: await toDataUrl(blob), previewUri };
}
