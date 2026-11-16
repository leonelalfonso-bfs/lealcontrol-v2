/**
 * Achica una imagen antes de guardarla embebida (data URL): una foto de celular pesa varios MB y viaja
 * en cada listado y en cada inicio de sesión. Las que tienen transparencia quedan en PNG; el resto en JPEG.
 */
export async function shrinkImage(file: File, maxSide: number): Promise<string> {
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  if (file.type === "image/svg+xml" || file.type === "image/gif") return original;

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("No se pudo leer la imagen."));
    img.src = original;
  });
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return original;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const transparent = file.type === "image/png" || file.type === "image/webp";
  const shrunk = transparent ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85);
  return shrunk.length < original.length ? shrunk : original;
}
