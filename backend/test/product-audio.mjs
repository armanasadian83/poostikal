import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectProductAudio } from '../dist/audio-upload.js';
import { waveFixture } from './audio-fixture.mjs';

test('audio inspection validates media content, duration and size', async () => {
  const valid = await inspectProductAudio({ buffer: waveFixture(), originalname: 'recording.WAV' });
  assert.equal(valid.durationSeconds, 60); assert.equal(valid.mime, 'audio/wav');
  for (const file of [
    { buffer: Buffer.alloc(0), originalname: 'empty.wav' },
    { buffer: Buffer.alloc(10 * 1024 * 1024 + 1), originalname: 'large.wav' },
    { buffer: waveFixture(91), originalname: 'long.wav' },
    { buffer: waveFixture(0.2), originalname: 'short.wav' },
    { buffer: waveFixture(), originalname: 'disguised.mp3' },
    { buffer: Buffer.from('ID3 not a recording'), originalname: 'malformed.mp3' },
    { buffer: Buffer.from('<script>alert(1)</script>'), originalname: 'script.wav' },
  ]) await assert.rejects(() => inspectProductAudio(file), error => error.getStatus() === 400);
});
