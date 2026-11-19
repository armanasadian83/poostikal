'use client';

import Image from 'next/image';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface LoginLipSculptureHandle {
  setOpen: (value: number) => void;
}

type Size = { width: number; height: number; dpr: number };
type Renderer = {
  kind: 'webgl' | '2d';
  resize: (size: Size) => void;
  draw: (open: number) => boolean;
  destroy: () => void;
};

type Aperture = {
  midpoints: Float32Array;
  gaps: Float32Array;
  tops: Float32Array;
  bottoms: Float32Array;
  closedTops: Float32Array;
  closedBottoms: Float32Array;
  closedSeams: Float32Array;
  width: number;
  height: number;
  left: number;
  right: number;
};

const SOURCE = '/images/login/lips-open.png';
const GEOMETRY_REFERENCE = '/images/login/lips-closed.png';
const COLUMNS = 96;
const FALLBACK_COLUMNS = 128;
/** Read only the enclosed central transparent component, once per image load. */
function deriveAperture(image: HTMLImageElement, closedImage: HTMLImageElement): Aperture | null {
  const canvas = document.createElement('canvas');
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) return null;
  canvas.width = width;
  canvas.height = height;

  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, width, height).data;
    const seed = Math.floor(height / 2) * width + Math.floor(width / 2);
    const alphaThreshold = 24;
    if (pixels[seed * 4 + 3] > alphaThreshold) return null;

    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    const upper = new Int32Array(width).fill(height);
    const lower = new Int32Array(width).fill(-1);
    let head = 0;
    let tail = 0;
    let first = width;
    let last = -1;

    function enqueue(pixel: number) {
      if (visited[pixel] || pixels[pixel * 4 + 3] > alphaThreshold) return;
      visited[pixel] = 1;
      queue[tail++] = pixel;
    }

    enqueue(seed);
    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return null;
      upper[x] = Math.min(upper[x], y);
      lower[x] = Math.max(lower[x], y);
      first = Math.min(first, x);
      last = Math.max(last, x);
      enqueue(pixel - 1);
      enqueue(pixel + 1);
      enqueue(pixel - width);
      enqueue(pixel + width);
    }
    if (tail < width * height * .01 || first >= last) return null;

    const rawMidpoints = new Float32Array(width);
    const rawGaps = new Float32Array(width);
    for (let x = 0; x < width; x += 1) {
      const sample = Math.max(first, Math.min(last, x));
      rawMidpoints[x] = (upper[sample] + lower[sample] + 1) / (2 * height);
      rawGaps[x] = x >= first && x <= last ? (lower[x] - upper[x] + 1) / height : 0;
    }

    const midpoints = new Float32Array(width);
    const gaps = new Float32Array(width);
    for (let x = 0; x < width; x += 1) {
      let weightSum = 0;
      for (let offset = -2; offset <= 2; offset += 1) {
        const sample = Math.max(0, Math.min(width - 1, x + offset));
        const weight = 3 - Math.abs(offset);
        midpoints[x] += rawMidpoints[sample] * weight;
        gaps[x] += rawGaps[sample] * weight;
        weightSum += weight;
      }
      midpoints[x] /= weightSum;
      gaps[x] = x >= first && x <= last ? gaps[x] / weightSum : 0;
    }

    function longestRun(data: Uint8ClampedArray, x: number, from: number, to: number) {
      let bestStart = -1;
      let bestEnd = -1;
      let runStart = -1;
      for (let y = from; y <= to + 1; y += 1) {
        const solid = y <= to && data[(y * width + x) * 4 + 3] >= 96;
        if (solid && runStart < 0) runStart = y;
        if (!solid && runStart >= 0) {
          if (y - runStart > bestEnd - bestStart + 1) {
            bestStart = runStart;
            bestEnd = y - 1;
          }
          runStart = -1;
        }
      }
      return { start: bestStart, end: bestEnd };
    }

    const tops = new Float32Array(width);
    const bottoms = new Float32Array(width);
    for (let x = 0; x < width; x += 1) {
      const middle = Math.floor(midpoints[x] * height);
      const topRun = longestRun(pixels, x, 0, middle);
      const bottomRun = longestRun(pixels, x, middle, height - 1);
      tops[x] = Math.min(midpoints[x] - gaps[x] / 2,
        topRun.start < 0 ? midpoints[x] : topRun.start / height);
      bottoms[x] = Math.max(midpoints[x] + gaps[x] / 2,
        bottomRun.end < 0 ? midpoints[x] : (bottomRun.end + 1) / height);
    }

    context.clearRect(0, 0, width, height);
    context.drawImage(closedImage, 0, 0, width, height);
    const closedPixels = context.getImageData(0, 0, width, height).data;
    const rawClosedTops = new Float32Array(width);
    const rawClosedBottoms = new Float32Array(width);
    for (let x = 0; x < width; x += 1) {
      const run = longestRun(closedPixels, x, 0, height - 1);
      rawClosedTops[x] = run.start < 0 ? .52 : run.start / height;
      rawClosedBottoms[x] = run.end < 0 ? .52 : (run.end + 1) / height;
    }

    const closedTops = new Float32Array(width);
    const closedBottoms = new Float32Array(width);
    const closedSeams = new Float32Array(width);
    const seamKnots = [[0, .52], [.2, .516], [.35, .507], [.5, .532], [.65, .507], [.8, .516], [1, .52]];
    for (let x = 0; x < width; x += 1) {
      const topSamples: number[] = [];
      const bottomSamples: number[] = [];
      for (let offset = -4; offset <= 4; offset += 1) {
        const sample = Math.max(0, Math.min(width - 1, x + offset));
        topSamples.push(rawClosedTops[sample]);
        bottomSamples.push(rawClosedBottoms[sample]);
      }
      topSamples.sort((a, b) => a - b);
      bottomSamples.sort((a, b) => a - b);
      closedTops[x] = topSamples[4];
      closedBottoms[x] = bottomSamples[4];
      const u = x / (width - 1);
      let segment = 0;
      while (segment < seamKnots.length - 2 && u > seamKnots[segment + 1][0]) segment += 1;
      const start = seamKnots[segment];
      const end = seamKnots[segment + 1];
      const t = (u - start[0]) / (end[0] - start[0]);
      const eased = t * t * (3 - 2 * t);
      const seam = start[1] + (end[1] - start[1]) * eased;
      closedSeams[x] = Math.max(closedTops[x], Math.min(closedBottoms[x], seam));
    }

    return {
      midpoints, gaps, tops, bottoms, closedTops, closedBottoms, closedSeams,
      width, height, left: first / width, right: (last + 1) / width,
    };
  } catch {
    return null;
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}

function apertureAt(aperture: Aperture, x: number) {
  const sample = Math.max(0, Math.min(aperture.width - 1, x * aperture.width - .5));
  const before = Math.floor(sample);
  const after = Math.min(aperture.width - 1, before + 1);
  const fraction = sample - before;
  const mix = (values: Float32Array) => values[before] + (values[after] - values[before]) * fraction;
  const midpoint = mix(aperture.midpoints);
  const gap = x <= aperture.left || x >= aperture.right ? 0 : aperture.gaps[before]
    + (aperture.gaps[after] - aperture.gaps[before]) * fraction;
  return {
    midpoint, gap, top: mix(aperture.tops), bottom: mix(aperture.bottoms),
    closedTop: mix(aperture.closedTops), closedBottom: mix(aperture.closedBottoms),
    closedSeam: mix(aperture.closedSeams),
  };
}

function columnPositions(aperture: Aperture, columns: number): number[] {
  const positions = Array.from({ length: columns + 1 }, (_, index) => index / columns);
  // Explicit aperture-edge vertices keep both halves joined at the mouth corners.
  positions.push(
    aperture.left, aperture.right,
    aperture.left + .5 / aperture.width, aperture.right - .5 / aperture.width,
  );
  const initial = [...new Set(positions)].sort((a, b) => a - b);
  const refined = [initial[0]];
  const tolerance = .75 / aperture.height;

  function appendSegment(x0: number, x1: number, depth: number) {
    const start = apertureAt(aperture, x0);
    const end = apertureAt(aperture, x1);
    let error = 0;
    for (const fraction of [.25, .5, .75]) {
      const sample = apertureAt(aperture, x0 + (x1 - x0) * fraction);
      const midpoint = start.midpoint + (end.midpoint - start.midpoint) * fraction;
      const gap = start.gap + (end.gap - start.gap) * fraction;
      error = Math.max(error,
        Math.abs((sample.midpoint - sample.gap / 2) - (midpoint - gap / 2)),
        Math.abs((sample.midpoint + sample.gap / 2) - (midpoint + gap / 2)),
      );
    }
    if (error > tolerance && depth < 6 && x1 - x0 > 1 / aperture.width) {
      const middle = (x0 + x1) / 2;
      appendSegment(x0, middle, depth + 1);
      appendSegment(middle, x1, depth + 1);
    } else {
      refined.push(x1);
    }
  }

  for (let index = 0; index < initial.length - 1; index += 1) {
    appendSegment(initial[index], initial[index + 1], 0);
  }
  return refined;
}

function lipRows(sample: ReturnType<typeof apertureAt>, lip: number) {
  return lip === 0
    ? {
      source: [0, sample.top, sample.midpoint - sample.gap / 2, sample.midpoint],
      target: [0, sample.closedTop, sample.closedSeam, sample.closedSeam],
    }
    : {
      source: [sample.midpoint, sample.midpoint + sample.gap / 2, sample.bottom, 1],
      target: [sample.closedSeam, sample.closedSeam, sample.closedBottom, 1],
    };
}

function createMesh(aperture: Aperture): { vertices: Float32Array; indices: Uint16Array } {
  const vertices: number[] = [];
  const indices: number[] = [];
  const positions = columnPositions(aperture, COLUMNS);

  for (let lip = 0; lip < 2; lip += 1) {
    const firstVertex = vertices.length / 3;
    for (const x of positions) {
      const rows = lipRows(apertureAt(aperture, x), lip);
      for (let row = 0; row < rows.source.length; row += 1) {
        vertices.push(x, rows.source[row], rows.target[row] - rows.source[row]);
      }
    }
    for (let column = 0; column < positions.length - 1; column += 1) {
      const first = firstVertex + column * 4;
      for (let row = 0; row < 3; row += 1) {
        const start = first + row;
        indices.push(start, start + 1, start + 4, start + 4, start + 1, start + 5);
      }
    }
  }

  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}

const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute float a_shift;
  uniform float u_open;
  uniform vec2 u_scale;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position;
    vec2 position = a_position;
    position.y += a_shift * (1.0 - u_open);
    vec2 clip = position * vec2(2.0, -2.0) + vec2(-1.0, 1.0);
    gl_Position = vec4(clip * u_scale, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;
  uniform sampler2D u_texture;
  varying vec2 v_uv;
  void main() {
    gl_FragColor = texture2D(u_texture, v_uv);
  }
`;

function createWebGLRenderer(
  canvas: HTMLCanvasElement, image: HTMLImageElement, aperture: Aperture,
): Renderer | null {
  let gl: WebGLRenderingContext | null;
  try {
    gl = canvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: true, antialias: true, depth: false, stencil: false,
    });
  } catch {
    return null;
  }
  if (!gl || gl.isContextLost()) return null;

  const shaders: WebGLShader[] = [];
  const buffers: WebGLBuffer[] = [];
  let program: WebGLProgram | null = null;
  let texture: WebGLTexture | null = null;
  const destroy = () => {
    for (const shader of shaders) gl.deleteShader(shader);
    for (const buffer of buffers) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    if (texture) gl.deleteTexture(texture);
  };

  try {
    function compile(type: number, source: string): WebGLShader {
      const shader = gl!.createShader(type);
      if (!shader) throw new Error('Shader unavailable');
      shaders.push(shader);
      gl!.shaderSource(shader, source);
      gl!.compileShader(shader);
      if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) throw new Error('Shader unavailable');
      return shader;
    }

    const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    program = gl.createProgram();
    if (!program) throw new Error('Program unavailable');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Program unavailable');

    const position = gl.getAttribLocation(program, 'a_position');
    const shift = gl.getAttribLocation(program, 'a_shift');
    const openUniform = gl.getUniformLocation(program, 'u_open');
    const scaleUniform = gl.getUniformLocation(program, 'u_scale');
    const textureUniform = gl.getUniformLocation(program, 'u_texture');
    if (position < 0 || shift < 0 || !openUniform || !scaleUniform || !textureUniform) {
      throw new Error('Program unavailable');
    }

    const mesh = createMesh(aperture);
    const vertexBuffer = gl.createBuffer();
    if (!vertexBuffer) throw new Error('Buffer unavailable');
    buffers.push(vertexBuffer);
    const indexBuffer = gl.createBuffer();
    if (!indexBuffer) throw new Error('Buffer unavailable');
    buffers.push(indexBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    texture = gl.createTexture();
    if (!texture) throw new Error('Texture unavailable');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    gl.useProgram(program);
    gl.uniform1i(textureUniform, 0);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(shift);
    gl.vertexAttribPointer(shift, 1, gl.FLOAT, false, 12, 8);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    return {
      kind: 'webgl',
      resize() {
        gl.viewport(0, 0, canvas.width, canvas.height);
        const ratio = canvas.width / canvas.height;
        gl.uniform2f(scaleUniform, ratio > 1 ? 1 / ratio : 1, ratio > 1 ? 1 : ratio);
      },
      draw(open) {
        if (gl.isContextLost()) return false;
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(openUniform, open);
        gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
        return true;
      },
      destroy,
    };
  } catch {
    destroy();
    return null;
  }
}

function create2DRenderer(
  canvas: HTMLCanvasElement, image: HTMLImageElement, aperture: Aperture,
): Renderer | null {
  let context: CanvasRenderingContext2D | null;
  try {
    context = canvas.getContext('2d', { alpha: true });
  } catch {
    return null;
  }
  if (!context) return null;
  let size: Size = { width: 1, height: 1, dpr: 1 };
  const columns = columnPositions(aperture, FALLBACK_COLUMNS);
  const boundaries = columns.map((x) => apertureAt(aperture, x));
  type Point = { x: number; y: number; shift: number };
  const triangles: { points: Point[]; b: number; d: number; f: number;
    left: number; top: number; width: number; height: number }[] = [];

  function addTriangle(points: Point[]) {
    const [a, b, c] = points;
    const dx1 = b.x - a.x;
    const dx2 = c.x - a.x;
    const dy1 = b.y - a.y;
    const dy2 = c.y - a.y;
    const determinant = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(determinant) < 1e-10) return;
    const shear = ((b.shift - a.shift) * dy2 - (c.shift - a.shift) * dy1) / determinant;
    const stretch = (dx1 * (c.shift - a.shift) - dx2 * (b.shift - a.shift)) / determinant;
    const left = Math.min(a.x, b.x, c.x);
    const top = Math.min(a.y, b.y, c.y);
    triangles.push({
      points, b: shear, d: stretch, f: a.shift - shear * a.x - stretch * a.y,
      left, top, width: Math.max(a.x, b.x, c.x) - left,
      height: Math.max(a.y, b.y, c.y) - top,
    });
  }

  for (let lip = 0; lip < 2; lip += 1) {
    for (let column = 0; column < columns.length - 1; column += 1) {
      const start = lipRows(boundaries[column], lip);
      const end = lipRows(boundaries[column + 1], lip);
      const point = (next: boolean, row: number): Point => ({
        x: columns[column + (next ? 1 : 0)],
        y: (next ? end : start).source[row],
        shift: (next ? end : start).target[row] - (next ? end : start).source[row],
      });
      for (let row = 0; row < 3; row += 1) {
        addTriangle([point(false, row), point(false, row + 1), point(true, row)]);
        addTriangle([point(true, row), point(false, row + 1), point(true, row + 1)]);
      }
    }
  }

  return {
    kind: '2d',
    resize(nextSize) { size = nextSize; },
    draw(open) {
      const side = Math.min(size.width, size.height);
      const left = (size.width - side) / 2;
      const top = (size.height - side) / 2;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;

      if (open === 1) {
        context.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
        context.drawImage(image, left, top, side, side);
        return true;
      }

      const closure = 1 - open;
      for (const triangle of triangles) {
        const stretch = 1 + closure * triangle.d;
        if (Math.abs(stretch) < 1e-8) continue;
        context.save();
        context.setTransform(
          side * size.dpr, side * closure * triangle.b * size.dpr, 0,
          side * stretch * size.dpr, left * size.dpr,
          (top + side * closure * triangle.f) * size.dpr,
        );
        context.beginPath();
        context.moveTo(triangle.points[0].x, triangle.points[0].y);
        context.lineTo(triangle.points[1].x, triangle.points[1].y);
        context.lineTo(triangle.points[2].x, triangle.points[2].y);
        context.closePath();
        context.clip();
        context.drawImage(
          image, triangle.left * image.naturalWidth, triangle.top * image.naturalHeight,
          triangle.width * image.naturalWidth, triangle.height * image.naturalHeight,
          triangle.left, triangle.top, triangle.width, triangle.height,
        );
        context.restore();
      }
      return true;
    },
    destroy() {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}

export const LoginLipSculpture = forwardRef<LoginLipSculptureHandle>(
  function LoginLipSculpture(_, ref) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const webglRef = useRef<HTMLCanvasElement>(null);
    const fallbackRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const openRef = useRef(1);
    const drawRef = useRef<(() => void) | null>(null);

    useImperativeHandle(ref, () => ({
      setOpen(value) {
        if (!Number.isFinite(value)) return;
        openRef.current = Math.max(0, Math.min(1, value));
        drawRef.current?.();
      },
    }), []);

    useEffect(() => {
      const wrapper = wrapperRef.current;
      const webglCanvas = webglRef.current;
      const fallbackCanvas = fallbackRef.current;
      const fallbackImage = imageRef.current;
      if (!wrapper || !webglCanvas || !fallbackCanvas || !fallbackImage) return;

      let disposed = false;
      let renderer: Renderer | null = null;
      let loadedImage: HTMLImageElement | null = null;
      let aperture: Aperture | null = null;
      let size: Size = { width: 1, height: 1, dpr: 1 };

      function showRenderer() {
        if (!renderer) return;
        wrapper!.dataset.renderer = renderer.kind;
        wrapper!.dataset.ready = 'true';
        delete wrapper!.dataset.error;
        webglCanvas!.style.visibility = renderer.kind === 'webgl' ? 'visible' : 'hidden';
        fallbackCanvas!.style.visibility = renderer.kind === '2d' ? 'visible' : 'hidden';
        fallbackImage!.style.visibility = 'hidden';
      }

      function activate2D() {
        if (!loadedImage || !aperture || disposed) return;
        renderer?.destroy();
        renderer = create2DRenderer(fallbackCanvas!, loadedImage, aperture);
        if (renderer) {
          renderer.resize(size);
          renderer.draw(openRef.current);
          showRenderer();
        } else {
          wrapper!.dataset.renderer = 'fallback';
          wrapper!.dataset.ready = 'false';
          wrapper!.dataset.error = 'context';
          webglCanvas!.style.visibility = 'hidden';
          fallbackCanvas!.style.visibility = 'hidden';
          fallbackImage!.style.visibility = 'visible';
        }
      }

      function draw() {
        if (disposed || !renderer) return;
        if (!renderer.draw(openRef.current)) activate2D();
      }

      function resize() {
        const bounds = wrapper!.getBoundingClientRect();
        size = {
          width: Math.max(1, bounds.width), height: Math.max(1, bounds.height),
          dpr: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
        };
        const width = Math.max(1, Math.round(size.width * size.dpr));
        const height = Math.max(1, Math.round(size.height * size.dpr));
        for (const canvas of [webglCanvas!, fallbackCanvas!]) {
          if (canvas.width !== width) canvas.width = width;
          if (canvas.height !== height) canvas.height = height;
        }
        renderer?.resize(size);
        draw();
      }

      function onContextLost(event: Event) {
        event.preventDefault();
        if (renderer?.kind === 'webgl') activate2D();
      }

      function onContextRestored() {
        if (disposed || !loadedImage || !aperture) return;
        const restored = createWebGLRenderer(webglCanvas!, loadedImage, aperture);
        if (!restored) return;
        renderer?.destroy();
        renderer = restored;
        renderer.resize(size);
        draw();
        showRenderer();
      }

      drawRef.current = draw;
      wrapper.dataset.ready = 'false';
      wrapper.dataset.renderer = 'loading';
      webglCanvas.style.visibility = 'hidden';
      fallbackCanvas.style.visibility = 'hidden';
      fallbackImage.style.visibility = 'visible';
      webglCanvas.addEventListener('webglcontextlost', onContextLost);
      webglCanvas.addEventListener('webglcontextrestored', onContextRestored);
      const observer = new ResizeObserver(resize);
      observer.observe(wrapper);
      window.addEventListener('resize', resize);
      resize();

      const image = new window.Image();
      const closedImage = new window.Image();
      image.decoding = 'async';
      closedImage.decoding = 'async';
      let imageLoaded = false;
      let closedLoaded = false;
      const initialize = () => {
        if (disposed || !imageLoaded || !closedLoaded) return;
        loadedImage = image;
        aperture = deriveAperture(image, closedImage);
        if (!aperture) {
          wrapper.dataset.renderer = 'fallback';
          wrapper.dataset.error = 'aperture';
          return;
        }
        renderer = createWebGLRenderer(webglCanvas, image, aperture);
        if (!renderer) {
          activate2D();
          return;
        }
        renderer.resize(size);
        draw();
        showRenderer();
      };
      image.onload = () => { imageLoaded = true; initialize(); };
      closedImage.onload = () => { closedLoaded = true; initialize(); };
      image.onerror = () => {
        if (disposed) return;
        wrapper.dataset.renderer = 'fallback';
        wrapper.dataset.error = 'image';
      };
      closedImage.onerror = () => {
        if (disposed) return;
        wrapper.dataset.renderer = 'fallback';
        wrapper.dataset.error = 'geometry';
      };
      image.src = SOURCE;
      closedImage.src = GEOMETRY_REFERENCE;

      return () => {
        disposed = true;
        if (drawRef.current === draw) drawRef.current = null;
        image.onload = null;
        image.onerror = null;
        closedImage.onload = null;
        closedImage.onerror = null;
        observer.disconnect();
        window.removeEventListener('resize', resize);
        webglCanvas.removeEventListener('webglcontextlost', onContextLost);
        webglCanvas.removeEventListener('webglcontextrestored', onContextRestored);
        renderer?.destroy();
      };
    }, []);

    return (
      <div
        ref={wrapperRef}
        className="login-lip-sculpture"
        data-renderer="loading"
        data-ready="false"
        aria-hidden="true"
        style={{ position: 'relative', width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        <Image
          ref={imageRef}
          src={SOURCE}
          alt=""
          fill
          unoptimized
          priority
          sizes="(max-width: 700px) 100vw, 1000px"
          style={{ objectFit: 'contain' }}
        />
        <canvas
          ref={webglRef}
          className="login-lip-canvas"
          data-renderer="webgl"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', visibility: 'hidden' }}
        />
        <canvas
          ref={fallbackRef}
          className="login-lip-canvas"
          data-renderer="2d"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', visibility: 'hidden' }}
        />
      </div>
    );
  },
);
