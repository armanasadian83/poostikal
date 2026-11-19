import {
  BoxGeometry, BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Material,
  InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, OrthographicCamera, PlaneGeometry,
  Texture, Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { templateDimensions, type UnboxingSceneConfig } from './animation-config';

const smooth = (start: number, end: number, p: number) => {
  const t = Math.max(0, Math.min(1, (p - start) / (end - start)));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** A hollow side-opening carton and a separate sealed sachet, in millimetre proportions. */
export function createPouchModel(config: UnboxingSceneConfig, cartonMap: Texture, pouchMap: Texture) {
  const shapes = new Set<BufferGeometry>();
  const paints = new Set<Material>();
  const group = new Group();
  const shape = <T extends BufferGeometry>(value: T) => { shapes.add(value); return value; };
  const paint = <T extends Material>(value: T) => { paints.add(value); return value; };
  function mesh(parent: Group, geometry: BufferGeometry, material: Material, x = 0, y = 0, z = 0) {
    const item = new Mesh(shape(geometry), material);
    item.position.set(x, y, z); item.castShadow = true; item.receiveShadow = true;
    parent.add(item); return item;
  }
  function panel(parent: Group, w: number, h: number, d: number, material: Material, x: number, y: number, z: number) {
    return mesh(parent, new BoxGeometry(w, h, d), material, x, y, z);
  }
  const sizes = { ...templateDimensions['pouch-box'], ...config.dimensions };
  const unit = 3.35 / (sizes.boxHeight ?? 105);
  const h = 3.35, w = (sizes.boxWidth ?? 160) * unit, d = (sizes.boxDepth ?? 16) * unit;
  const pw = (sizes.productWidth ?? 150) * unit, ph = (sizes.productHeight ?? 96) * unit, pd = (sizes.productDepth ?? 5) * unit;
  const side = config.openingSide === 'right' ? 1 : -1;
  const t = Math.min(.022, d * .045);
  const { appearance } = config;
  const paper = paint(new MeshPhysicalMaterial({ color: appearance.carton, roughness: .56, clearcoat: .12, clearcoatRoughness: .4 }));
  const lining = paint(new MeshStandardMaterial({ color: appearance.base, roughness: .87 }));
  const print = paint(new MeshBasicMaterial({ map: cartonMap, toneMapped: false }));
  const carton = new Group(); carton.name = 'carton'; group.add(carton);
  // No wall at the opening: the pouch is occluded by actual cardboard, then slides clear.
  panel(carton, w, h, t, paper, 0, h / 2, d / 2);
  panel(carton, w, h, t, lining, 0, h / 2, -d / 2);
  panel(carton, w, t, d, paper, 0, h - t / 2, 0);
  panel(carton, w, t, d, lining, 0, t / 2, 0);
  panel(carton, t, h, d, paper, -side * (w / 2 - t / 2), h / 2, 0);
  const face = mesh(carton, new PlaneGeometry(w - t, h - t), print, 0, h / 2, d / 2 + t / 2 + .001);
  face.castShadow = false;

  const door = new Group();
  door.position.set(side * w / 2, h / 2, -d / 2);
  carton.add(door);
  panel(door, t, h - t, d, paper, 0, 0, d / 2);
  // The tuck flap is nested under the printed face while closed.
  const tuck = new Group(); tuck.position.z = d; door.add(tuck);
  const tabWidth = Math.min(d * .48, w * .12);
  mesh(tuck, new RoundedBoxGeometry(tabWidth, h * .88, t, 3, t * .45), lining, -side * tabWidth / 2, 0, -t);
  const upper = new Group(), lower = new Group();
  upper.position.set(side * (w / 2 - t), h - t * 1.5, 0);
  lower.position.set(side * (w / 2 - t), t * 1.5, 0);
  carton.add(upper, lower);
  const flapLength = Math.min(d * .8, w * .2);
  panel(upper, flapLength, t, d * .9, lining, -side * flapLength / 2, 0, 0);
  panel(lower, flapLength, t, d * .9, lining, -side * flapLength / 2, 0, 0);

  const pouch = new Group(); pouch.name = 'pouch'; group.add(pouch);
  const glossy = appearance.material === 'glass';
  const foil = paint(new MeshPhysicalMaterial({ color: appearance.bottle, metalness: .82, roughness: .27, clearcoat: .35, clearcoatRoughness: .2 }));
  const ink = paint(new MeshPhysicalMaterial({ map: pouchMap, roughness: glossy ? .26 : .72, metalness: .04, clearcoat: glossy ? 1 : .08, clearcoatRoughness: .12, side: DoubleSide }));
  const radius = Math.min(pw, ph) * .035;
  mesh(pouch, new RoundedBoxGeometry(pw, ph, pd * .25, 4, Math.min(radius, pd * .12)), foil, 0, ph / 2, 0);

  // A rounded, slightly inflated face gives the foil real depth and continuous highlights.
  const nx = 64, ny = 48;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const rim = Math.min(pw, ph) * .035;
  const iw = pw - rim * 2, ih = ph - rim * 2, ir = radius * .85;
  for (let j = 0; j <= ny; j++) {
    const v = j / ny, y = v * ih - ih / 2;
    const edgeDistance = Math.max(0, Math.abs(y) - (ih / 2 - ir));
    const halfWidth = iw / 2 - ir + Math.sqrt(Math.max(0, ir * ir - edgeDistance * edgeDistance));
    for (let i = 0; i <= nx; i++) {
      const u = i / nx, envelope = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
      const bulge = pd * .38 * envelope;
      const ripple = Math.sin(u * 53 + v * 7) * Math.sin(v * 39) * pd * .018 * envelope;
      positions.push((u - .5) * halfWidth * 2, y + ph / 2, pd * .15 + bulge + ripple);
      uvs.push(u, v);
      if (i < nx && j < ny) { const a = j * (nx + 1) + i; indices.push(a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1); }
    }
  }
  const surface = new BufferGeometry();
  surface.setAttribute('position', new Float32BufferAttribute(positions, 3));
  surface.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  surface.setIndex(indices); surface.computeVertexNormals();
  mesh(pouch, surface, ink);
  // Fine heat-seal ridges catch light around the border without adding a photo background.
  const ridgeGeometry = shape(new BoxGeometry(rim * .1, rim * .62, pd * .025));
  const horizontalSeals = new InstancedMesh(ridgeGeometry, foil, 136);
  const transform = new Matrix4();
  pouch.add(horizontalSeals);
  for (let i = 0; i < 68; i++) {
    const x = -pw / 2 + rim + (pw - 2 * rim) * i / 67;
    horizontalSeals.setMatrixAt(i * 2, transform.makeTranslation(x, rim * .45, pd * .14));
    horizontalSeals.setMatrixAt(i * 2 + 1, transform.makeTranslation(x, ph - rim * .45, pd * .14));
  }
  const verticalRidge = shape(new BoxGeometry(rim * .62, rim * .1, pd * .025));
  const verticalSeals = new InstancedMesh(verticalRidge, foil, 88);
  pouch.add(verticalSeals);
  for (let i = 0; i < 44; i++) {
    const y = rim + (ph - 2 * rim) * i / 43;
    verticalSeals.setMatrixAt(i * 2, transform.makeTranslation(-pw / 2 + rim * .45, y, pd * .14));
    verticalSeals.setMatrixAt(i * 2 + 1, transform.makeTranslation(pw / 2 - rim * .45, y, pd * .14));
  }
  const target = new Vector3(), viewDirection = new Vector3(side * 2.4, 2.7, 14);
  let poseValues: number[] = [];
  return {
    group,
    pose(progress: number, aspect: number, camera: OrthographicCamera) {
      const open = smooth(.025, .30, progress), wings = smooth(.12, .34, progress);
      const extract = smooth(.35, .77, progress), settle = smooth(.79, .985, progress);
      door.rotation.y = side * 1.95 * open;
      tuck.rotation.y = -side * .38 * open;
      upper.rotation.z = -side * 1.95 * wings;
      lower.rotation.z = side * 1.95 * wings;
      const clearDistance = w / 2 + pw / 2 + d * 1.1 + .12;
      // Finish alongside and just behind the carton. Translation in depth only starts
      // after the complete pouch (including its rear edge) has cleared the open flap.
      const endDistance = w / 2 + pw / 2 - pw * .13;
      const x = side * (clearDistance * extract + (endDistance - clearDistance) * settle);
      const tilt = side * .045 * settle;
      pouch.position.set(x, (h - ph) / 2 * (1 - settle) + Math.abs(Math.sin(tilt)) * pw / 2, -(d / 2 + pd * .65 + .06) * settle);
      pouch.rotation.set(0, side * .12 * settle, tilt);
      target.set(x * .48, h / 2, -d * .12 * settle);
      camera.position.copy(target).add(viewDirection); camera.lookAt(target);
      const span = w + Math.abs(x) + d * .7 + .65;
      const requiredWidth = span / Math.max(.1, aspect);
      const requiredHeight = h * 1.23 + d * .3;
      const viewHeight = (requiredWidth + requiredHeight + Math.sqrt((requiredWidth - requiredHeight) ** 2 + .04)) / 2;
      camera.left = -viewHeight * aspect / 2; camera.right = viewHeight * aspect / 2;
      camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2; camera.updateProjectionMatrix();
      group.updateMatrixWorld(true);
      poseValues = [door.rotation.y, upper.rotation.z, lower.rotation.z, pouch.position.x, pouch.position.y, pouch.position.z];
    },
    get poseValues() { return poseValues; },
    dispose() { horizontalSeals.dispose(); verticalSeals.dispose(); shapes.forEach(g => g.dispose()); paints.forEach(m => m.dispose()); group.clear(); },
  };
}
