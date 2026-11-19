import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const MAX_STORED_BYTES = 2_000_000;
export function compressReceipt(input: Buffer) {
  return optimizePrivatePhoto(input, 'تصویر فیش باید حداکثر ۱۰ مگابایت باشد.');
}
export async function optimizePrivatePhoto(input: Buffer, sizeError = 'تصویر باید حداکثر ۱۰ مگابایت باشد.') {
  if (!input?.length || input.length > MAX_INPUT_BYTES) throw new BadRequestException(sizeError);
  try {
    const source = sharp(input, {limitInputPixels: 40_000_000, failOn: 'error'});
    const metadata = await source.metadata();
    if (!['jpeg','png','webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1) throw new Error();
    // Start with a large, legible document. Reduce dimensions only if quality alone is insufficient.
    for (const [edge,quality] of [[2800,90],[2500,84],[2200,78],[1800,74],[1400,70]]) {
      const result = await source.clone().rotate().resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true})
        .flatten({background:'#ffffff'}).webp({quality,effort:4}).toBuffer();
      if (result.length < MAX_STORED_BYTES) return result;
    }
  } catch { /* Decode errors and unsupported formats share a customer-facing message. */ }
  throw new BadRequestException('تصویر قابل خواندن نیست. یک عکس JPG، PNG یا WebP با وضوح مناسب انتخاب کن.');
}
