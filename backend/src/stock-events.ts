import {Controller, Get, HttpException, Injectable, OnApplicationBootstrap, OnModuleDestroy, Req, Res} from '@nestjs/common';
import type {Request, Response} from 'express';
import {Client} from 'pg';
import {createClient} from 'redis';
import {Database} from './database.js';
import {requireCustomerSession} from './customer-session.js';

const postgresChannel = 'poostikal_stock';
const maxConnections = 500;
const perCustomerLimit = 4;
const revisionCheckMs = 10_000;
const connectionLifetimeMs = 300_000;

type Stream = {customerId:string; response:Response; expiresAt:number};
const connectableRedis = (url:string, disableOfflineQueue:boolean) => createClient({
  url, disableOfflineQueue, commandsQueueMaxLength:128, socket:{connectTimeout:2000},
});

@Injectable()
export class StockEvents implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly streams = new Set<Stream>();
  private readonly counts = new Map<string, number>();
  private readonly redisChannel = (process.env.REDIS_NAMESPACE || 'poostikal') + ':stock:v1';
  private publisher?: ReturnType<typeof connectableRedis>;
  private subscriber?: ReturnType<typeof connectableRedis>;
  private listener?: Client;
  private reconnect?: NodeJS.Timeout;
  private refresh?: NodeJS.Timeout;
  private refreshDelay = 0;
  private monitor?: NodeJS.Timeout;
  private heartbeat?: NodeJS.Timeout;
  private reading = false;
  private readAgain = false;
  private stopping = false;
  private revision?: string;

  constructor(private readonly database:Database) {}

  onApplicationBootstrap() {
    this.listenToPostgres();
    this.connectRedis();
    this.monitor = setInterval(() => this.scheduleRefresh(), revisionCheckMs).unref();
    this.heartbeat = setInterval(() => {
      for (const stream of this.streams) {
        if (stream.expiresAt <= Date.now()) stream.response.end();
        else this.write(stream, ': heartbeat\n\n');
      }
    }, 15_000).unref();
  }

  private connectRedis() {
    const url = process.env.REDIS_URL;
    if (!url) return;
    try {
      const publisher = connectableRedis(url, true);
      const subscriber = connectableRedis(url, false);
      for (const connection of [publisher, subscriber]) connection.on('error', () => {
        this.scheduleRefresh();
      });
      subscriber.on('ready', () => this.scheduleRefresh());
      this.publisher = publisher;
      this.subscriber = subscriber;
      void publisher.connect().catch(() => this.scheduleRefresh());
      void subscriber.connect()
        .then(() => this.stopping ? undefined : subscriber.subscribe(this.redisChannel, () => this.scheduleRefresh()))
        .catch(() => this.scheduleRefresh());
    } catch {
      console.error('Invalid Redis configuration; using PostgreSQL for stock events.');
    }
  }

  private listenToPostgres() {
    if (this.stopping) return;
    const listener = new Client({
      connectionString:process.env.DATABASE_URL, application_name:'poostikal-stock-events',
      connectionTimeoutMillis:5000, keepAlive:true,
      ...(process.env.DATABASE_SSL === 'true' ? {ssl:{rejectUnauthorized:true}} : {}),
    });
    this.listener = listener;
    const onDisconnect = () => {
      if (this.listener !== listener) return;
      this.listener = undefined;
      void listener.end().catch(() => {});
      if (!this.stopping) this.reconnect = setTimeout(() => this.listenToPostgres(), 2000).unref();
    };
    listener.on('error', onDisconnect);
    listener.on('end', onDisconnect);
    listener.on('notification', notification => {
      if (notification.channel !== postgresChannel) return;
      if (this.publisher?.isReady) {
        // Redis is the fast path. A delayed local read covers a missed broadcast.
        void this.publisher.publish(this.redisChannel, 'changed').catch(() => this.scheduleRefresh());
        this.scheduleRefresh(250);
      } else this.scheduleRefresh();
    });
    void listener.connect().then(() => listener.query('LISTEN ' + postgresChannel))
      .then(() => this.scheduleRefresh()).catch(onDisconnect);
  }

  private scheduleRefresh(delay = 40) {
    if (this.stopping || !this.streams.size) return;
    if (this.reading) { this.readAgain = true; return; }
    if (this.refresh) {
      if (delay >= this.refreshDelay) return;
      clearTimeout(this.refresh);
    }
    this.refreshDelay = delay;
    this.refresh = setTimeout(() => {
      this.refresh = undefined;
      void this.refreshRevision();
    }, delay).unref();
  }

  private async refreshRevision() {
    if (this.stopping || !this.streams.size) return;
    this.reading = true;
    try {
      const {rows} = await this.database.pool.query<{revision:string}>('SELECT revision FROM storefront_revision WHERE singleton');
      const revision = rows[0]?.revision;
      if (this.stopping || !revision || revision === this.revision) return;
      this.revision = revision;
      for (const stream of this.streams) this.write(stream, this.event(revision));
    } catch {
      // The next periodic check retries after a temporary database failure.
    } finally {
      this.reading = false;
      if (this.readAgain) { this.readAgain = false; this.scheduleRefresh(); }
    }
  }

  private event(revision:string) { return `event: stock\ndata: ${revision}\n\n`; }

  private write(stream:Stream, message:string) {
    if (!stream.response.destroyed && !stream.response.writableEnded && !stream.response.write(message)) {
      // A stalled browser can reconnect and revalidate from the latest revision.
      stream.response.destroy();
    }
  }

  open(customerId:string, expiresAt:Date, response:Response) {
    if (response.destroyed) return;
    const count = this.counts.get(customerId) || 0;
    if (this.streams.size >= maxConnections || count >= perCustomerLimit) {
      throw new HttpException('تعداد اتصال‌های به‌روزرسانی سبد به حد مجاز رسیده.', 429);
    }
    const stream = {customerId, response, expiresAt:Math.min(+expiresAt, Date.now()+connectionLifetimeMs)};
    this.streams.add(stream);
    this.counts.set(customerId, count + 1);
    response.once('close', () => {
      if (!this.streams.delete(stream)) return;
      const remaining = (this.counts.get(customerId) || 1) - 1;
      if (remaining) this.counts.set(customerId, remaining);
      else this.counts.delete(customerId);
    });
    response.set({
      'Content-Type':'text/event-stream; charset=utf-8',
      'Cache-Control':'private, no-store, no-transform',
      'X-Accel-Buffering':'no',
    });
    response.flushHeaders();
    this.write(stream, `retry: 5000\n${this.event(this.revision ?? 'initial')}`);
    this.scheduleRefresh();
  }

  async onModuleDestroy() {
    this.stopping = true;
    clearTimeout(this.reconnect);
    clearTimeout(this.refresh);
    clearInterval(this.monitor);
    clearInterval(this.heartbeat);
    for (const stream of this.streams) stream.response.end();
    if (this.subscriber?.isOpen) this.subscriber.destroy();
    if (this.publisher?.isOpen) this.publisher.destroy();
    const listener = this.listener;
    this.listener = undefined;
    await listener?.end().catch(() => {});
  }
}

@Controller('api/customer')
export class StockEventsController {
  constructor(private readonly database:Database, private readonly events:StockEvents) {}

  @Get('stock-events')
  async stream(@Req() request:Request, @Res() response:Response) {
    const customer = await requireCustomerSession(this.database.pool, request);
    this.events.open(customer.id, customer.expires_at, response);
  }
}
