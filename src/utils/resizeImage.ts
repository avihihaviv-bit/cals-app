/**
 * Downscales a photo before it's sent for AI analysis. Phone photos are
 * often 3-4 MB; a ~1280px JPEG keeps every detail the model needs while
 * uploading far faster and costing far fewer image tokens. Falls back to the
 * original if the browser can't decode the image (e.g. an unsupported format).
 */
export async function downscaleImage(dataUrl: string, maxDimension = 1280, quality = 0.85): Promise<string> {
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
