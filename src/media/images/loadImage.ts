export interface LoadedImage {
  readonly image: HTMLImageElement;
  readonly url: string;
  readonly dispose: () => void;
}

export function loadImageFromBlob(blob: Blob): Promise<LoadedImage> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  return new Promise((resolve, reject) => {
    image.onload = () => {
      image.onload = null;
      image.onerror = null;
      resolve({
        image,
        url,
        dispose: () => URL.revokeObjectURL(url),
      });
    };
    image.onerror = () => {
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(url);
      reject(new Error("Background image could not be decoded."));
    };
    image.src = url;
  });
}
