// Client-side image helper: reads a picked file and downscales it to a compact
// data URL so profile photos and school logos stay small enough to store inline
// (User.photoUrl / School.logoUrl) without a separate file-storage service.
// Call only from client components (uses the DOM canvas + FileReader).
export async function downscaleToDataUrl(file: File, max = 256, quality = 0.85): Promise<string> {
  const readAsDataUrl = (f: File) => new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ""));
    r.onerror = () => rej(new Error("read failed"));
    r.readAsDataURL(f);
  });
  const original = await readAsDataUrl(file);
  return await new Promise<string>((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(original);
        ctx.drawImage(img, 0, 0, w, h);
        // Preserve transparency for PNG logos; JPEG for photos (smaller).
        const mime = /png|gif|webp|svg/i.test(file.type) ? "image/png" : "image/jpeg";
        resolve(canvas.toDataURL(mime, quality));
      };
      img.onerror = () => resolve(original);
      img.src = original;
    } catch { resolve(original); }
  });
}
