import {
  ACESFilmicToneMapping, Box3, BufferGeometry, CatmullRomCurve3,
  Color, DirectionalLight, Euler, Group, HemisphereLight, Material, Matrix4,
  Mesh, MeshPhysicalMaterial, MeshStandardMaterial, NoColorSpace, OrthographicCamera, Scene,
  SRGBColorSpace, Texture, TextureLoader, TubeGeometry, Vector3, WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export interface SkinSceneHandle {
  resize: (width: number, height: number, dpr: number) => void;
  render: (angle: number, tilt: number) => void;
  dispose: () => void;
}

/** A textured tissue volume, with macro skin relief and fine, curved 3D hairs. */
export async function createSkinModelScene(canvas: HTMLCanvasElement): Promise<SkinSceneHandle> {
  // Resolve the shared atlas before allocating a WebGL context or revealing the model.
  const atlas = await new TextureLoader().loadAsync('/images/poostikal/skin-beauty-atlas.png');
  const textures = new Set<Texture>([atlas]);
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const scene = new Scene();
  const pivot = new Group();
  const model = new Group();
  pivot.add(model);
  scene.add(pivot);
  const camera = new OrthographicCamera(-4, 4, 4, -4, .1, 100);
  camera.position.set(5.6, 5.2, 12);
  camera.lookAt(0, 0, 0);
  let renderer: WebGLRenderer | null = null;
  let disposed = false;

  function geometry<T extends BufferGeometry>(value: T): T {
    geometries.add(value);
    return value;
  }

  // Upper half: skin surface. Lower half: tissue section. Insets prevent atlas bleed.
  function texture(x: number, y: number, w: number, h: number, color = true) {
    const result = atlas.clone();
    result.offset.set(x + .002, y + .002);
    result.repeat.set(w - .004, h - .004);
    result.colorSpace = color ? SRGBColorSpace : NoColorSpace;
    result.anisotropy = Math.min(8, renderer?.capabilities.getMaxAnisotropy() ?? 1);
    result.needsUpdate = true;
    textures.add(result);
    return result;
  }

  function tissue(x: number, y: number, w: number, h: number, surface = false) {
    const material = new MeshPhysicalMaterial({
      map: texture(x, y, w, h), bumpMap: texture(x, y, w, h, false),
      bumpScale: surface ? .017 : .022,
      roughness: surface ? .56 : .68, metalness: 0,
      sheen: surface ? .22 : .12,
      sheenColor: new Color('#ffe5e0'), sheenRoughness: .78,
      clearcoat: surface ? .08 : .025, clearcoatRoughness: .55,
    });
    materials.add(material);
    return material;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    textures.forEach(value => value.dispose());
    materials.forEach(value => value.dispose());
    geometries.forEach(value => value.dispose());
    scene.clear();
    renderer?.renderLists.dispose();
    renderer?.dispose();
    renderer = null;
  }

  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = .96;
    scene.add(new HemisphereLight(0xfff7fa, 0xc4a7bd, 1.75));
    const key = new DirectionalLight(0xfffaf7, 2.0);
    key.position.set(-5, 8, 10);
    scene.add(key);
    const fill = new DirectionalLight(0xf3dcff, 1.1);
    fill.position.set(7, 3, -5);
    scene.add(fill);

    const width = 5.25, height = 2.18, depth = 2.65;
    const slab = geometry(new RoundedBoxGeometry(width, height, depth, 8, .18));
    const vertices = slab.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
      // Small organic contours preserve a cut face without ruler-straight edges.
      const contour = Math.sin(x * 1.1 + z * .5) * .028 + Math.sin(x * 2.4 - z * 1.1) * .012;
      vertices.setY(i, y + contour);
    }
    vertices.needsUpdate = true;
    const cutFace = tissue(0, 0, 1, .5);
    const skin = tissue(0, .5, 1, .5, true);
    const left = tissue(.02, 0, .51, .5);
    const right = tissue(.47, 0, .51, .5);
    const underside = tissue(.15, 0, .65, .14);
    model.add(new Mesh(slab, [right, left, skin, underside, cutFace, cutFace]));

    const hairPaint = new MeshStandardMaterial({ color: '#986d54', roughness: .6 });
    const fineHairPaint = new MeshStandardMaterial({ color: '#ba9171', roughness: .74 });
    materials.add(hairPaint);
    materials.add(fineHairPaint);
    function hair(x: number, z: number, length: number, bend: number, radius: number) {
      const y = height / 2;
      const points = [
        new Vector3(x, y - .025, z),
        new Vector3(x + bend * .22, y + length * .35, z - .025),
        new Vector3(x + bend * .65, y + length * .77, z - .065),
        new Vector3(x + bend, y + length, z - .11),
      ];
      const shape = geometry(new TubeGeometry(new CatmullRomCurve3(points), 16, radius, 5, false));
      model.add(new Mesh(shape, radius > .009 ? hairPaint : fineHairPaint));
    }
    // Sparse, delicate shafts preserve the anatomy without a bristly silhouette.
    hair(-1.36, depth / 2 - .12, .30, .13, .010);
    for (let i = 0; i < 4; i++) {
      const x = -1.8 + i * 1.04;
      const z = -.65 + (i % 3) * .46;
      hair(x, z, .09 + (i % 2) * .022, .035, .004);
    }

    // Fix framing across the full turn rather than zooming with the current pose.
    model.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model);
    const center = bounds.getCenter(new Vector3());
    model.position.sub(center);
    bounds.min.sub(center);
    bounds.max.sub(center);
    camera.updateMatrixWorld(true);
    const corners: Vector3[] = [];
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) corners.push(new Vector3(x, y, z));
      }
    }
    const rotation = new Matrix4(), orientation = new Euler(), projected = new Vector3();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const tilt of [-.055, 0, .055]) {
      for (let sample = 0; sample < 64; sample++) {
        rotation.makeRotationFromEuler(orientation.set(tilt, sample / 64 * Math.PI * 2, 0));
        for (const point of corners) {
          projected.copy(point).applyMatrix4(rotation).applyMatrix4(camera.matrixWorldInverse);
          minX = Math.min(minX, projected.x); maxX = Math.max(maxX, projected.x);
          minY = Math.min(minY, projected.y); maxY = Math.max(maxY, projected.y);
        }
      }
    }
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    const extentX = (maxX - minX) * .53, extentY = (maxY - minY) * .53;

    return {
      resize(width, height, dpr) {
        if (disposed || !renderer || !Number.isFinite(width) || !Number.isFinite(height)) return;
        const w = Math.max(1, width), h = Math.max(1, height), ratio = w / h;
        const halfHeight = Math.max(extentY, extentX / ratio);
        camera.left = centerX - halfHeight * ratio;
        camera.right = centerX + halfHeight * ratio;
        camera.top = centerY + halfHeight;
        camera.bottom = centerY - halfHeight;
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(Number.isFinite(dpr) ? Math.min(2, Math.max(1, dpr)) : 1);
        renderer.setSize(w, h, false);
      },
      render(angle, tilt) {
        if (disposed || !renderer) return;
        pivot.rotation.set(Number.isFinite(tilt) ? tilt : 0, Number.isFinite(angle) ? angle : 0, 0);
        renderer.render(scene, camera);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
