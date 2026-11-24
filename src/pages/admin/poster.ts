export interface Size {
  width: number;
  height: number;
}

const MAX_POSTER_WIDTH = 480;

interface Drawable {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

function loadWithImg(blob: Blob): Promise<Drawable> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    const done = () => URL.revokeObjectURL(url);
    img.onload = () => {
      resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight, close: done });
    };
    img.onerror = () => {
      done();
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}

async function loadFirstFrame(blob: Blob): Promise<Drawable> {
  if (typeof ImageDecoder !== "undefined") {
    try {
      const decoder = new ImageDecoder({ data: blob.stream(), type: blob.type || "image/gif" });
      const { image } = await decoder.decode({ frameIndex: 0 });
      return {
        source: image,
        width: image.displayWidth,
        height: image.displayHeight,
        close: () => {
          image.close();
          decoder.close();
        },
      };
    } catch {
      // Fall through to the <img> path.
    }
  }
  return loadWithImg(blob);
}

/** Natural pixel size of an image, or null when the browser can't decode it. */
export async function measureImage(blob: Blob): Promise<Size | null> {
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(blob);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    }
  } catch {
    // Fall through to the <img> path.
  }
  try {
    const d = await loadWithImg(blob);
    d.close();
    return { width: d.width, height: d.height };
  } catch {
    return null;
  }
}

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.8));
}

/**
 * First frame at most 480 px wide, as webp or, when the browser can't encode webp
 * (Safari quietly returns a png), as jpeg. Null when anything fails.
 */
export async function makePoster(file: Blob): Promise<Blob | null> {
  let frame: Drawable | undefined;
  try {
    frame = await loadFirstFrame(file);
    if (!frame.width || !frame.height) return null;
    const scale = Math.min(1, MAX_POSTER_WIDTH / frame.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(frame.width * scale));
    canvas.height = Math.max(1, Math.round(frame.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(frame.source, 0, 0, canvas.width, canvas.height);
    for (const type of ["image/webp", "image/jpeg"]) {
      const blob = await encode(canvas, type);
      // An unsupported type comes back as png, so check what we actually got.
      if (blob && blob.type === type) return blob;
    }
    return null;
  } catch {
    return null;
  } finally {
    frame?.close();
  }
}
