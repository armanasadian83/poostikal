const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Validates local uploads before a long-lived preview URL is registered. */
export async function validateAdminImageFile(file: File, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (!file.size) throw new Error('فایل تصویر خالی است.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('حجم هر تصویر باید حداکثر ۵ مگابایت باشد.');
  if ((file.type && !IMAGE_MIME_TYPES.includes(file.type)) || !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    throw new Error('فقط تصویر JPG، PNG یا WebP را انتخاب کن.');
  }

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  signal?.throwIfAborted();
  const matches = (bytes: number[], offset = 0) => bytes.every((byte, index) => header[offset + index] === byte);
  const detected = matches([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? 'image/png'
    : matches([0xff, 0xd8, 0xff]) ? 'image/jpeg'
      : matches([0x52, 0x49, 0x46, 0x46]) && matches([0x57, 0x45, 0x42, 0x50], 8) ? 'image/webp' : null;
  const extensionType = /\.png$/i.test(file.name) ? 'image/png' : /\.webp$/i.test(file.name) ? 'image/webp' : 'image/jpeg';
  if (!detected || (file.type && file.type !== detected) || extensionType !== detected) {
    throw new Error('محتوای فایل با فرمت تصویر مطابقت ندارد. فایل اصلی تصویر را انتخاب کن.');
  }

  const temporaryUrl = URL.createObjectURL(file);
  const image = new window.Image();
  image.decoding = 'async';
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => signal?.removeEventListener('abort', abort);
      const abort = () => { cleanup(); reject(new DOMException('Image validation cancelled', 'AbortError')); };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      image.src = temporaryUrl;
      void image.decode().then(() => {
        cleanup();
        if (signal?.aborted) { reject(new DOMException('Image validation cancelled', 'AbortError')); return; }
        if (!image.naturalWidth || !image.naturalHeight) { reject(new Error('ابعاد تصویر معتبر نیست.')); return; }
        resolve();
      }, () => { cleanup(); reject(new Error('تصویر قابل خواندن نیست یا فایل آسیب دیده است.')); });
    });
    signal?.throwIfAborted();
  } finally {
    image.removeAttribute('src');
    URL.revokeObjectURL(temporaryUrl);
  }
}
