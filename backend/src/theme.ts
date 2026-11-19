import { Body, Controller, Get, HttpException, Injectable, Put, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Database } from './database.js';
import { ReadBatch } from './read-batch.js';
import { AdminGuard } from './security.js';
import { parse } from './validation.js';

export const defaultPalette = {
  primary: '#290c68', secondary: '#8840c8', accent: '#ed4c97',
  background: '#fbf8ff', surface: '#ffffff', text: '#290c68', muted: '#806a97',
  success: '#288163', warning: '#b87814', danger: '#bd355b',
};
const color = z.string().regex(/^#[0-9a-f]{6}$/i).transform(value => value.toLowerCase());
export const paletteSchema = z.object({
  primary: color, secondary: color, accent: color, background: color, surface: color,
  text: color, muted: color, success: color, warning: color, danger: color,
}).strict();
export const themeSchema = z.object({ palette: paletteSchema, version: z.number().int().min(0) }).strict();
type Theme = { palette: typeof defaultPalette; version: number };

@Injectable()
export class ThemeService {
  private readonly reads = new ReadBatch();
  constructor(private readonly db: Database) {}
  async get(): Promise<Theme> {
    return this.reads.read('theme', async () => {
      const result = await this.db.pool.query("SELECT document FROM settings WHERE id='theme'");
      const parsed = themeSchema.safeParse(result.rows[0]?.document);
      return parsed.success ? parsed.data : { palette: defaultPalette, version: 0 };
    });
  }
  async save(body: unknown) {
    const input = parse(themeSchema, body);
    return this.db.transaction(async client => {
      await client.query("INSERT INTO settings(id,document) VALUES('theme',$1) ON CONFLICT(id) DO NOTHING", [{ palette: defaultPalette, version: 0 }]);
      const current = (await client.query("SELECT document FROM settings WHERE id='theme' FOR UPDATE")).rows[0].document as Theme;
      if (input.version !== current.version) throw new HttpException('رنگ‌ها در پنجره دیگری تغییر کرده‌اند؛ تنظیمات ذخیره‌شده را دوباره دریافت کن.', 409);
      const next = { palette: input.palette, version: current.version + 1 };
      await client.query("UPDATE settings SET document=$1 WHERE id='theme'", [next]);
      return next;
    });
  }
}

@Controller('api')
export class ThemeController {
  constructor(private readonly theme: ThemeService) {}
  @Get('theme') async get(@Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Poostikal-Public','1');
    return this.theme.get();
  }
  @Put('admin/theme') @UseGuards(AdminGuard) save(@Body() body: unknown) { return this.theme.save(body); }
}
