'use client';
import {useSiteSettings} from './site-settings-provider';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { audioTime, type ProductAudio as Audio } from '@/lib/product-audio';
import { Icon } from './icons';

// Decorative sound bars; position always comes from the actual recording.
const bars = [18,28,44,24,36,55,72,48,31,63,86,58,40,66,90,69,49,33,55,76,100,70,50,79,59,34,48,68,92,64,45,73,55,38,26,46,65,84,61,42,60,38,23,41,57,36,25,16];
const rates = [1, 1.25, 1.5];

export function ProductAudioPlayer({ audio, productName }: { audio?: Audio | null; productName: string }) {
  return <AudioPlayer key={audio?.url ?? 'pending'} audio={audio} productName={productName}/>;
}

function AudioPlayer({ audio, productName }: { audio?: Audio | null; productName: string }) {
  const {settings:{shop:config}}=useSiteSettings();
  const titleId = useId();
  const media = useRef<HTMLAudioElement>(null);
  const playIntent = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(audio?.durationSeconds ?? 60);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState('');
  const progress = duration > 0 ? Math.min(100, time / duration * 100) : 0;

  useEffect(() => {
    const element = media.current;
    if (!element) return;
    const stopForOtherAudio = (event: Event) => {
      if (event.target instanceof HTMLMediaElement && event.target !== element) { playIntent.current = false; element.pause(); }
    };
    document.addEventListener('play', stopForOtherAudio, true);
    return () => { playIntent.current = false; element.pause(); document.removeEventListener('play', stopForOtherAudio, true); };
  }, []);

  async function togglePlay() {
    const element = media.current;
    if (!element || !audio) return;
    if (playIntent.current || !element.paused) { playIntent.current = false; element.pause(); setBuffering(false); return; }
    if (error) element.load();
    setError('');
    if (element.ended) element.currentTime = 0;
    playIntent.current = true;
    setBuffering(true);
    try { await element.play(); if (!playIntent.current) element.pause(); }
    catch (cause) {
      if (playIntent.current && !(cause instanceof DOMException && cause.name === 'AbortError')) {
        setError('پخش صدا انجام نشد. دوباره امتحان کن.'); playIntent.current = false;
      }
      setBuffering(false);
    }
  }

  return <section className={`product-audio${playing ? ' is-playing' : ''}${!audio ? ' is-pending' : ''}`} aria-labelledby={titleId}>
    <div className="product-audio-heading">
      <h2 id={titleId}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/></svg>{config.audioTitle}</h2>
      <span className="product-audio-caption">{audio ? 'صدای پوستیکال' : 'به‌زودی'}</span>
    </div>
    <div className="product-audio-player">
      <button type="button" className="product-audio-play" onClick={togglePlay} disabled={!audio} aria-label={buffering || playing ? 'توقف معرفی صوتی' : error ? 'تلاش دوباره برای پخش معرفی صوتی' : 'پخش معرفی صوتی'} aria-pressed={playing}>
        {buffering ? <span className="product-audio-spinner" aria-hidden="true"/> : <Icon name={playing ? 'pause' : 'play'} size={21}/>}
      </button>
      <div className="product-audio-track">
        <div className="product-audio-wave" style={{ '--audio-progress': `${progress}%` } as CSSProperties}>
          <div className="product-audio-bars" aria-hidden="true">{bars.map((height, index) => <span key={index} style={{ height: `${height}%` }}/>)}</div>
          <div className="product-audio-bars product-audio-bars-played" aria-hidden="true">{bars.map((height, index) => <span key={index} style={{ height: `${height}%` }}/>)}</div>
          <input type="range" min="0" max={duration || 60} step="0.1" value={Math.min(time, duration)} disabled={!audio || !!error} aria-label={`موقعیت پخش معرفی صوتی ${productName}`} aria-valuetext={`${audioTime(time)} از ${audioTime(duration)}`} onChange={event => {
            const element = media.current;
            if (!element || !Number.isFinite(element.duration)) return;
            const next = Number(event.target.value); element.currentTime = next; setTime(next);
          }}/>
        </div>
        <div className="product-audio-timing" dir="ltr"><span>{audioTime(time)}</span><span>{audioTime(duration)}</span></div>
      </div>
      <button type="button" className="product-audio-rate" disabled={!audio} aria-label={`سرعت پخش ${rate} برابر؛ تغییر سرعت`} onClick={() => {
        const next = rates[(rates.indexOf(rate) + 1) % rates.length]; setRate(next); if (media.current) media.current.playbackRate = next;
      }} dir="ltr">{rate}×</button>
    </div>
    {error ? <p className="product-audio-error" role="alert">{error}</p> : null}
    {audio?.transcript ? <details className="product-audio-transcript"><summary>متن معرفی صوتی<Icon name="chevron-down" size={14}/></summary><p>{audio.transcript}</p></details> : null}
    {audio ? <audio ref={media} src={audio.url} preload="metadata" aria-label={`معرفی صوتی ${productName}`} onLoadedMetadata={event => {
      const length = event.currentTarget.duration; if (Number.isFinite(length) && length > 0) setDuration(length);
    }} onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onPlaying={() => { setPlaying(true); setBuffering(false); }} onPause={() => { setPlaying(false); setBuffering(false); }} onWaiting={() => { if (playIntent.current) setBuffering(true); }} onEnded={() => { playIntent.current = false; setPlaying(false); setBuffering(false); }} onError={() => {
      playIntent.current = false; setPlaying(false); setBuffering(false); setError('فایل صوتی در دسترس نیست. دوباره امتحان کن.');
    }}/> : null}
  </section>;
}
