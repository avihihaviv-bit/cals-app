/**
 * Downscales a photo before it's sent for AI analysis. Phone photos are
 * often 3-4 MB; a ~1536px JPEG (two 768px tiles per side — the size Gemini
 * reads at full detail) keeps small things legible (seeds, cheese cubes, a
 * label) while uploading far faster than the original. Falls back to the
 * original if the browser can't decode the image (e.g. an unsupported format).
 */
export async function downscaleImage(dataUrl: string, maxDimension = 1536, quality = 0.8): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);
    if (!width || !height) return dataUrl;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    // Smooth downscaling: a 4000px photo squeezed in one step otherwise gets jagged, losing fine texture.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    const result = canvas.toDataURL('image/jpeg', quality);
    return result.startsWith('data:image/jpeg') ? result : dataUrl;
  } catch {
    return dataUrl;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = src;
  });
}
