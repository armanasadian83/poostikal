import { BadRequestException } from '@nestjs/common';
import { parseBuffer } from 'music-metadata';

export async function inspectProductAudio(file: { buffer: Buffer; originalname: string }) {
  const buffer = file.buffer;
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new BadRequestException('حجم فایل صوتی باید بین صفر و ۱۰ مگابایت باشد.');
  const extension = file.originalname.toLowerCase().split('.').pop();
  const wave = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE';
  const mp3 = buffer.toString('ascii', 0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe6) === 0xe2);
  const m4a = buffer.toString('ascii', 4, 8) === 'ftyp';
  const mime = extension === 'mp3' && mp3 ? 'audio/mpeg' : extension === 'wav' && wave ? 'audio/wav' : extension === 'm4a' && m4a ? 'audio/mp4' : null;
  if (!mime) throw new BadRequestException('فایل صوتی معتبر MP3، WAV یا M4A انتخاب کن.');
  try {
    const { format } = await parseBuffer(buffer, { mimeType: mime, size: buffer.length }, { duration: true, skipCovers: true });
    if (!format.duration || !Number.isFinite(format.duration) || !format.sampleRate || !format.numberOfChannels || format.trackInfo.some(track => !!track.video)) throw new Error('invalid');
    if (format.duration < 1 || format.duration > 90.5) throw new BadRequestException('معرفی صوتی باید بین ۱ تا ۹۰ ثانیه باشد؛ زمان پیشنهادی یک دقیقه است.');
    return { buffer, ext: extension!, mime, durationSeconds: Math.round(format.duration * 100) / 100 };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('فایل صوتی قابل خواندن نیست؛ فایل اصلی صدا را انتخاب کن.');
  }
}
