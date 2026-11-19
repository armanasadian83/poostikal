export function waveFixture(seconds = 60) {
  const rate = 8000, size = Math.round(seconds * rate) * 2, buffer = Buffer.alloc(44 + size);
  buffer.write('RIFF'); buffer.writeUInt32LE(size + 36, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(size, 40);
  return buffer;
}
