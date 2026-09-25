/** Remove only completely blank trailing pages, using html2pdf's exact pixel page height. */
export function trimBlankPdfPages(canvas: HTMLCanvasElement, pageHeight: number): HTMLCanvasElement {
  if (pageHeight < 1 || canvas.height <= pageHeight) return canvas;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return canvas;
  let height = canvas.height;
  while (height > pageHeight) {
    const pageStart = Math.floor((height - 1) / pageHeight) * pageHeight;
    const pixels = context.getImageData(0, pageStart, canvas.width, height - pageStart).data;
    // Any visible, non-white pixel means this page contains content: never discard it.
    let blank = true;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] !== 0 && (pixels[i] !== 255 || pixels[i + 1] !== 255 || pixels[i + 2] !== 255)) {
        blank = false;
        break;
      }
    }
    if (!blank) break;
    height = pageStart;
  }
  if (height === canvas.height) return canvas;
  const trimmed = document.createElement("canvas");
  trimmed.width = canvas.width;
  trimmed.height = height;
  const target = trimmed.getContext("2d");
  if (!target) return canvas;
  target.drawImage(canvas, 0, 0, canvas.width, height, 0, 0, canvas.width, height);
  return trimmed;
}
