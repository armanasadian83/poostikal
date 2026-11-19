'use client';

import { useEffect, useId, useRef, useState } from 'react';

type RecorderPhase = 'ready' | 'requesting' | 'recording' | 'stopping' | 'preview' | 'error';
type RecorderSnapshot = { phase: RecorderPhase; seconds: number; objectUrl: string; error: string };
const EMPTY_RECORDING: RecorderSnapshot = { phase: 'ready', seconds: 0, objectUrl: '', error: '' };
const MAX_SECONDS = 120;
const isBusy = (phase: RecorderPhase) => phase === 'requesting' || phase === 'recording' || phase === 'stopping';

function recordingError(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'اجازهٔ میکروفن داده نشد. از تنظیمات مرورگر اجازه بده و دوباره امتحان کن.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'میکروفنی پیدا نشد. اتصال میکروفن را بررسی کن.';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'میکروفن در دسترس نیست؛ شاید برنامهٔ دیگری از آن استفاده می‌کند.';
  if (name === 'NotSupportedError') return 'این مرورگر قالب ضبط صدا را پشتیبانی نمی‌کند.';
  return 'شروع ضبط انجام نشد. میکروفن را بررسی کن و دوباره امتحان کن.';
}

// Owns browser resources independently of React renders and ignores stale permission results.
class LocalVoiceRecorder {
  private snapshot = { ...EMPTY_RECORDING };
  private generation = 0;
  private disposed = false;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private stopDeadline: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly changed: (snapshot: RecorderSnapshot) => void, private readonly busyChanged: (busy: boolean) => void) {}

  private update(next: Partial<RecorderSnapshot>) {
    if (this.disposed) return;
    const wasBusy = isBusy(this.snapshot.phase);
    this.snapshot = { ...this.snapshot, ...next };
    this.changed({ ...this.snapshot });
    if (wasBusy !== isBusy(this.snapshot.phase)) this.busyChanged(isBusy(this.snapshot.phase));
  }

  private clearTimers() {
    if (this.ticker !== null) clearInterval(this.ticker);
    if (this.deadline !== null) clearTimeout(this.deadline);
    if (this.stopDeadline !== null) clearTimeout(this.stopDeadline);
    this.ticker = this.deadline = this.stopDeadline = null;
  }

  private stopTracks() {
    const stream = this.stream;
    this.stream = null;
    stream?.getTracks().forEach(track => { try { track.stop(); } catch { /* Other tracks still need cleanup. */ } });
  }

  private releaseMedia() {
    this.clearTimers();
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') { try { recorder.stop(); } catch { /* The track may already have ended. */ } }
    }
    this.stopTracks();
    this.chunks = [];
  }

  private revokePreview() {
    if (this.snapshot.objectUrl) URL.revokeObjectURL(this.snapshot.objectUrl);
  }

  private elapsed() { return Math.min(MAX_SECONDS, Math.max(0, Math.floor((performance.now() - this.startedAt) / 1000))); }

  private fail(message: string) {
    this.generation += 1;
    this.releaseMedia();
    this.revokePreview();
    this.update({ phase: 'error', seconds: 0, objectUrl: '', error: message });
  }

  async start() {
    if (this.disposed || isBusy(this.snapshot.phase)) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.fail('ضبط صدا در این مرورگر یا این صفحه در دسترس نیست. یک مرورگر به‌روز و اتصال امن را امتحان کن.');
      return;
    }
    this.revokePreview();
    const generation = ++this.generation;
    this.update({ phase: 'requesting', seconds: 0, objectUrl: '', error: '' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (this.disposed || generation !== this.generation) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      this.stream = stream;
      if (!stream.getAudioTracks().length) {
        this.fail('میکروفنی پیدا نشد. اتصال میکروفن را بررسی کن.');
        return;
      }
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported?.(type));
      let recorder: MediaRecorder;
      try { recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined); }
      catch { recorder = new MediaRecorder(stream); }
      this.recorder = recorder;
      this.chunks = [];
      recorder.ondataavailable = event => {
        if (!this.disposed && generation === this.generation && event.data.size > 0) this.chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (!this.disposed && generation === this.generation) this.fail('ضبط صدا انجام نشد. دوباره امتحان کن.');
      };
      recorder.onstop = () => {
        if (this.disposed || generation !== this.generation) return;
        const seconds = this.snapshot.phase === 'stopping' ? this.snapshot.seconds : this.elapsed();
        const chunks = this.chunks;
        const type = recorder.mimeType || chunks[0]?.type || 'audio/webm';
        this.releaseMedia();
        const blob = new Blob(chunks, { type });
        if (!blob.size) { this.fail('صدایی برای پخش ثبت نشد. کمی طولانی‌تر ضبط کن.'); return; }
        try { this.update({ phase: 'preview', seconds, objectUrl: URL.createObjectURL(blob), error: '' }); }
        catch { this.fail('پخش صدای ضبط‌شده در این مرورگر آماده نشد. دوباره امتحان کن.'); }
      };
      this.startedAt = performance.now();
      recorder.start(1000);
      this.update({ phase: 'recording' });
      this.ticker = setInterval(() => {
        const seconds = this.elapsed();
        if (seconds !== this.snapshot.seconds) this.update({ seconds });
        if (seconds >= MAX_SECONDS) this.stop();
      }, 250);
      this.deadline = setTimeout(() => this.stop(), MAX_SECONDS * 1000);
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.fail(recordingError(error));
    }
  }

  stop() {
    if (this.disposed || this.snapshot.phase !== 'recording' || !this.recorder) return;
    this.update({ phase: 'stopping', seconds: this.elapsed() });
    this.clearTimers();
    try {
      this.recorder.stop();
      this.stopTracks();
      if (this.recorder) this.stopDeadline = setTimeout(() => {
        if (this.snapshot.phase === 'stopping') this.fail('پایان ضبط آماده نشد. دوباره امتحان کن.');
      }, 5000);
    } catch { this.fail('پایان ضبط انجام نشد. دوباره امتحان کن.'); }
  }

  cancel() {
    if (this.disposed) return;
    this.generation += 1;
    this.releaseMedia();
    this.revokePreview();
    this.update({ ...EMPTY_RECORDING });
  }

  dispose() {
    if (this.disposed) return;
    const busy = isBusy(this.snapshot.phase);
    this.disposed = true;
    this.generation += 1;
    this.releaseMedia();
    this.revokePreview();
    if (busy) this.busyChanged(false);
  }
}

function MicrophoneIcon() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8.5" y="2.5" width="7" height="12" rx="3.5"/><path d="M5 10.5v1a7 7 0 0 0 14 0v-1M12 18.5v3M8.5 21.5h7"/></svg>;
}

type VoiceRecorderProps = { disabled?: boolean; resetKey: string; onRecordingChange?: (recording: boolean) => void };

function RecorderControls({ disabled = false, onRecordingChange }: Omit<VoiceRecorderProps, 'resetKey'>) {
  const [snapshot, setSnapshot] = useState<RecorderSnapshot>(EMPTY_RECORDING);
  const controller = useRef<LocalVoiceRecorder | null>(null);
  const microphoneButton = useRef<HTMLButtonElement>(null);
  const busyCallback = useRef(onRecordingChange);
  const panelId = useId();
  useEffect(() => { busyCallback.current = onRecordingChange; }, [onRecordingChange]);
  useEffect(() => {
    const recording = new LocalVoiceRecorder(setSnapshot, busy => busyCallback.current?.(busy));
    controller.current = recording;
    return () => { controller.current = null; recording.dispose(); };
  }, []);

  const { phase, seconds, objectUrl, error } = snapshot;
  const active = isBusy(phase);
  const open = phase !== 'ready';
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const remainder = String(seconds % 60).padStart(2, '0');
  const label = phase === 'recording' ? 'پایان ضبط صدا' : phase === 'requesting' ? 'لغو درخواست میکروفن' : phase === 'stopping' ? 'در حال پایان ضبط' : phase === 'preview' ? 'ضبط دوبارهٔ صدا' : 'ضبط پیام صوتی';
  const status = phase === 'requesting' ? 'منتظر اجازهٔ میکروفن' : phase === 'recording' ? 'در حال ضبط صدا' : phase === 'stopping' ? 'در حال آماده‌کردن صدا' : phase === 'preview' ? 'صدای تو آمادهٔ پخش است' : error;

  return <>
    <button ref={microphoneButton} type="button" className={`chat-mic-button${active ? ' is-recording' : ''}`} disabled={disabled || phase === 'stopping'} aria-label={label} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => {
      if (phase === 'recording') controller.current?.stop();
      else if (phase === 'requesting') controller.current?.cancel();
      else void controller.current?.start();
    }}><MicrophoneIcon/></button>
    {open ? <section className={`voice-recorder-panel voice-recorder-${phase}`} id={panelId} aria-label="ضبط پیام صوتی">
      <div className="voice-recorder-header"><div className="voice-recorder-status" role="status" aria-live="polite"><span className="voice-recorder-indicator" aria-hidden="true"/><span>{status}</span></div>{phase === 'recording' || phase === 'stopping' || phase === 'preview' ? <time className="voice-recorder-time" aria-label="زمان ضبط" aria-live="off" dir="ltr">{minutes}:{remainder}</time> : null}</div>
      {phase === 'recording' ? <div className="voice-recorder-meter" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6, 7, 8].map(index => <span key={index}/>)}</div> : null}
      {phase === 'requesting' ? <p className="voice-recorder-detail">برای شروع ضبط، اجازهٔ دسترسی به میکروفن را در مرورگر بده.</p> : null}
      {phase === 'recording' ? <p className="voice-recorder-detail">حداکثر زمان ضبط، دو دقیقه است.</p> : null}
      {phase === 'preview' ? <audio className="voice-recorder-audio" src={objectUrl} controls preload="metadata" aria-label="پخش صدای ضبط‌شده"/> : null}
      <p className="voice-recorder-note">تبدیل صدا به متن در مرحلهٔ بعد فعال می‌شود.</p>
      <div className="voice-recorder-actions">{phase === 'recording' ? <button type="button" className="voice-recorder-stop" onClick={() => controller.current?.stop()}><span aria-hidden="true"/>پایان ضبط</button> : null}<button type="button" className="voice-recorder-cancel" onClick={() => { controller.current?.cancel(); microphoneButton.current?.focus(); }}>{phase === 'preview' ? 'حذف صدا' : phase === 'error' ? 'بستن' : 'لغو'}</button></div>
    </section> : null}
  </>;
}

export function VoiceRecorder({ resetKey, ...props }: VoiceRecorderProps) {
  return <RecorderControls key={resetKey} {...props}/>;
}
