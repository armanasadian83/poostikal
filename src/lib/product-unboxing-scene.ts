import { defaultAppearance, templateDimensions, type UnboxingSceneConfig } from './animation-config';
import {
  ACESFilmicToneMapping, AmbientLight, BoxGeometry, BufferGeometry,
  CylinderGeometry, DirectionalLight, DoubleSide, Float32BufferAttribute, Group,
  HemisphereLight, LatheGeometry, Material, Mesh, MeshBasicMaterial, MeshPhysicalMaterial,
  MeshStandardMaterial, OrthographicCamera, PCFShadowMap, PlaneGeometry,
  PMREMGenerator, Scene, ShadowMaterial, SRGBColorSpace, Texture, TextureLoader, TorusGeometry,
  Vector2, Vector3, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createPouchModel } from './product-pouch-model';

export interface ProductUnboxingSceneHandle {
  resize: (width: number, height: number, dpr: number) => void;
  render: (progress: number) => void;
  setMagnified?: (magnified: boolean) => void;
  dispose: () => void;
}

type Point = readonly [number, number, number];

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smoothMax = (first: number, second: number) => (first + second + Math.sqrt((first - second) ** 2 + .09)) / 2;
// Zero first and second derivatives at either end keep every hinge and camera move calm.
const ease = (start: number, end: number, progress: number) => {
  const t = clamp((progress - start) / (end - start));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** Continuous, pose-based geometry: there is no video seek, frame swapping, or clock. */
export async function createProductUnboxingScene(canvas: HTMLCanvasElement, isCancelled: () => boolean = () => false, config?: UnboxingSceneConfig): Promise<ProductUnboxingSceneHandle> {
  const loader = new TextureLoader();
  const loaded = await Promise.allSettled([
    loader.loadAsync(config?.cartonUrl ?? '/images/unboxing/caffeina-carton-print.png'),
    loader.loadAsync(config?.labelUrl ?? '/images/unboxing/caffeina-bottle-label.png'),
  ]);
  if (loaded.some(result => result.status === 'rejected')) {
    loaded.forEach(result => { if (result.status === 'fulfilled') result.value.dispose(); });
    throw new Error('The product printing could not be loaded.');
  }
  if (isCancelled()) {
    loaded.forEach(result => { if (result.status === 'fulfilled') result.value.dispose(); });
    throw new Error('Product scene initialization was cancelled.');
  }
  const [cartonMap, labelMap] = loaded.map(result => (result as PromiseFulfilledResult<Texture>).value);
  cartonMap.colorSpace = SRGBColorSpace;
  labelMap.colorSpace = SRGBColorSpace;
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>([cartonMap, labelMap]);
  const scene = new Scene();
  const model = new Group();
  scene.add(model);
  const camera = new OrthographicCamera(-3, 3, 3, -3, .1, 100);
  let renderer: WebGLRenderer | null = null;
  let environmentTarget: ReturnType<PMREMGenerator['fromScene']> | null = null;
  let disposed = false;
  let aspect = 1;
  let currentProgress = 0;
  let pouchModel: ReturnType<typeof createPouchModel> | null = null;

  const geometry = <T extends BufferGeometry>(value: T): T => { geometries.add(value); return value; };
  const material = <T extends Material>(value: T): T => { materials.add(value); return value; };
  const appearance = config?.appearance ?? defaultAppearance;
  const template = config?.template ?? 'dropper-box';
  const sizes = { ...templateDimensions[template], ...config?.dimensions };
  const unit = 3.35 / (sizes.boxHeight ?? 85);
  const boxWidth = config ? (sizes.boxWidth ?? 45) * unit : 1.78;
  const boxDepth = config ? (sizes.boxDepth ?? 32) * unit : 1.2;
  const productHeight = config ? (sizes.productHeight ?? 75) * unit : 2.99;
  const diameter = config ? (sizes.productDiameter ?? 24) * unit : .9;
  const paper = material(new MeshStandardMaterial({ color: appearance.carton, roughness: .77, metalness: 0 }));
  const innerPaper = material(new MeshStandardMaterial({ color: appearance.carton, roughness: .88, metalness: 0 }));
  const printedPaper = material(new MeshBasicMaterial({ color: 0xffffff, map: cartonMap, toneMapped: false }));
  const burgundy = material(new MeshStandardMaterial({ color: appearance.base, roughness: .63 }));
  const edge = material(new MeshStandardMaterial({ color: appearance.carton, roughness: .9 }));
  const black = material(new MeshPhysicalMaterial({ color: appearance.cap, roughness: .31, metalness: .08, clearcoat: .24, clearcoatRoughness: .2 }));
  const collarEdge = material(new MeshStandardMaterial({ color: appearance.cap, roughness: .42, metalness: .15 }));

  function addMesh(parent: Group | Mesh | Scene, shape: BufferGeometry, paint: Material | Material[], position: Point = [0, 0, 0]) {
    const item = new Mesh(shape, paint);
    item.position.set(...position);
    item.castShadow = true;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  }
  function box(parent: Group, width: number, height: number, depth: number, paint: Material | Material[], position: Point) {
    return addMesh(parent, geometry(new BoxGeometry(width, height, depth)), paint, position);
  }
  function lathe(parent: Group, points: readonly (readonly [number, number])[], paint: Material) {
    return addMesh(parent, geometry(new LatheGeometry(points.map(([radius, y]) => new Vector2(radius, y)), 96)), paint);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    pouchModel?.dispose();
    environmentTarget?.dispose();
    environmentTarget = null;
    textures.forEach(texture => texture.dispose());
    materials.forEach(paint => paint.dispose());
    geometries.forEach(shape => shape.dispose());
    scene.clear();
    renderer?.renderLists.dispose();
    renderer?.dispose();
    renderer = null;
    textures.clear();
    materials.clear();
    geometries.clear();
  }

  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0xffffff, 0);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = .95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    const pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    environmentTarget = pmrem.fromScene(room, .04);
    scene.environment = environmentTarget.texture;
    scene.environmentIntensity = .65;
    room.dispose();
    pmrem.dispose();
    cartonMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    labelMap.anisotropy = cartonMap.anisotropy;

    scene.add(new AmbientLight(0xffffff, .2));
    scene.add(new HemisphereLight(0xffffff, 0xd9d1cd, .85));
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(-2, 15, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 10;
    key.shadow.camera.bottom = -6;
    key.shadow.camera.near = .1;
    key.shadow.camera.far = 28;
    key.shadow.bias = -.0002;
    key.shadow.normalBias = .025;
    key.shadow.radius = 4;
    key.target.position.set(0, 2.7, 0);
    scene.add(key, key.target);
    const fill = new DirectionalLight(0xfff9ef, .65);
    fill.position.set(5, 5, -4);
    scene.add(fill);
    const stripLight = new DirectionalLight(0xffffff, .9);
    stripLight.position.set(2, 4, 6);
    scene.add(stripLight);

    // White studio ground has no visible edge and only receives the actual soft shadows.
    const ground = addMesh(scene, geometry(new PlaneGeometry(200, 200)), material(new ShadowMaterial({ color: '#5b5154', opacity: .08 })), [0, -.025, 0]);
    ground.rotation.x = -Math.PI / 2;
    ground.castShadow = false;

    if (config?.template === 'pouch-box') {
      const pouch = createPouchModel(config, cartonMap, labelMap);
      pouchModel = pouch;
      model.add(pouch.group);
      const render = (progress: number) => {
        if (disposed || !renderer) return;
        currentProgress = clamp(progress);
        pouch.pose(currentProgress, aspect, camera);
        renderer.render(scene, camera);
        canvas.dataset.pose = pouch.poseValues.map(value => value.toFixed(4)).join(',');
      };
      const resize = (width: number, height: number, dpr: number) => {
        if (disposed || !renderer || width < 1 || height < 1) return;
        aspect = width / height;
        renderer.setPixelRatio(Math.max(1, Math.min(2, dpr)));
        renderer.setSize(width, height, false);
        render(currentProgress);
      };
      return { resize, render, dispose };
    }

    const carton = new Group();
    carton.position.set(-.62, 0, .28);
    model.add(carton);
    carton.scale.set(boxWidth / 1.78, 1, boxDepth / 1.2);
    const width = 1.78;
    const height = 3.35;
    const depth = 1.2;
    const thickness = .027;
    const front = depth / 2;
    const back = -depth / 2;
    // Each wall is real thin cardboard; there is no closed top cube hiding the bottle.
    box(carton, width, height, thickness, paper, [0, height / 2, front]);
    const printedFront = addMesh(carton, geometry(new PlaneGeometry(width, height)), printedPaper, [0, height / 2, front + thickness / 2 + .001]);
    printedFront.castShadow = false;
    box(carton, width, height, thickness, innerPaper, [0, height / 2, back]);
    box(carton, thickness, height, depth, paper, [-width / 2, height / 2, 0]);
    box(carton, thickness, height, depth, paper, [width / 2, height / 2, 0]);
    box(carton, width, .04, depth, innerPaper, [0, .02, 0]);
    // Printed burgundy continues around the sides and the folded base.
    box(carton, thickness + .003, .245, depth, burgundy, [-width / 2 - .001, .1225, 0]);
    box(carton, thickness + .003, .245, depth, burgundy, [width / 2 + .001, .1225, 0]);
    box(carton, width, .245, thickness + .003, burgundy, [0, .1225, back - .001]);
    box(carton, .006, height - .04, .007, edge, [width / 2 + .013, height / 2, front + .013]);
    box(carton, .006, height - .04, .007, edge, [-width / 2 - .013, height / 2, front + .013]);
    // Inner liner is visible around the open rim without protruding through the outer walls.
    box(carton, width - .05, .065, .01, paper, [0, height - .033, back + .02]);

    const rearLid = new Group();
    rearLid.position.set(0, height + .009, back);
    carton.add(rearLid);
    box(rearLid, width + .012, thickness, depth + .015, [paper, paper, paper, innerPaper, paper, paper], [0, 0, depth / 2]);
    const tuckTab = new Group();
    tuckTab.position.set(0, -.003, depth + .006);
    rearLid.add(tuckTab);
    addMesh(tuckTab, geometry(new RoundedBoxGeometry(width * .86, .24, .018, 2, .012)), paper, [0, -.12, -.015]);

    const leftFlap = new Group();
    const rightFlap = new Group();
    leftFlap.position.set(-width / 2 + .018, height - .024, 0);
    rightFlap.position.set(width / 2 - .018, height - .024, 0);
    carton.add(leftFlap, rightFlap);
    const flapWidth = width * .4;
    box(leftFlap, flapWidth, .018, depth * .94, paper, [flapWidth / 2, 0, 0]);
    box(rightFlap, flapWidth, .018, depth * .94, paper, [-flapWidth / 2, 0, 0]);

    const frontFlap = new Group();
    frontFlap.position.set(0, height - .04, front - .02);
    carton.add(frontFlap);
    box(frontFlap, width * .96, .017, depth * .28, paper, [0, 0, -depth * .14]);

    // A narrow tamper strip physically bends up from the cardboard before the lid opens.
    const stripSegments = 48;
    const stripPositions = new Float32Array((stripSegments + 1) * 2 * 3);
    const stripUvs = new Float32Array((stripSegments + 1) * 2 * 2);
    const stripIndices: number[] = [];
    for (let row = 0; row <= stripSegments; row += 1) {
      stripUvs.set([0, row / stripSegments, 1, row / stripSegments], row * 4);
      if (row < stripSegments) {
        const a = row * 2;
        stripIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const stripShape = geometry(new BufferGeometry());
    stripShape.setAttribute('position', new Float32BufferAttribute(stripPositions, 3));
    stripShape.setAttribute('uv', new Float32BufferAttribute(stripUvs, 2));
    stripShape.setIndex(stripIndices);
    const sealPaint = material(new MeshPhysicalMaterial({ color: '#171616', roughness: .45, metalness: .1, side: DoubleSide, transparent: true }));
    const seal = addMesh(carton, stripShape, sealPaint);
    seal.frustumCulled = false;
    seal.visible = appearance.seal;

    const bottle = new Group();
    model.add(bottle);
    bottle.scale.set(diameter / .9, productHeight / 2.99, diameter / .9);
    const glass = material(new MeshPhysicalMaterial({ color: appearance.bottle, roughness: .055, metalness: 0, transmission: appearance.material === 'glass' ? .94 : 0, thickness: .1, ior: 1.47, transparent: true, opacity: appearance.material === 'glass' ? .84 : 1, clearcoat: 1, clearcoatRoughness: .025, envMapIntensity: 1.6 }));
    const glassBase = material(new MeshPhysicalMaterial({ color: '#edf2e9', roughness: .08, transmission: .83, thickness: .2, ior: 1.47, transparent: true, opacity: .74, envMapIntensity: 1.5 }));
    const serum = material(new MeshPhysicalMaterial({ color: '#f0eedc', roughness: .04, transmission: .94, thickness: .4, ior: 1.34, transparent: true, opacity: .2 }));
    if (template === 'dropper-box') {
    lathe(bottle, [
      [0, .015], [.29, .015], [.375, .028], [.425, .075], [.446, .145],
      [.45, .24], [.45, 1.61], [.441, 1.7], [.414, 1.79], [.35, 1.89],
      [.26, 1.98], [.198, 2.02], [.19, 2.15], [0, 2.15],
    ], glass);
    lathe(bottle, [[0, .03], [.3, .03], [.392, .06], [.417, .105], [.417, .17], [0, .17]], glassBase);
    lathe(bottle, [[0, .15], [.395, .15], [.405, .23], [.405, 1.57], [.39, 1.65], [0, 1.65]], serum);

    const labelPaint = material(new MeshBasicMaterial({ map: labelMap, color: 0xffffff, side: DoubleSide, toneMapped: false }));
    const label = addMesh(bottle, geometry(new CylinderGeometry(.453, .453, 1.3, 128, 1, true, -Math.PI * (config ? .48 : .69), Math.PI * (config ? .96 : 1.38))), labelPaint, [0, .94, 0]);
    label.castShadow = false;
    // The pipette is visible through the clear shoulder rather than being painted on a sprite.
    addMesh(bottle, geometry(new CylinderGeometry(.028, .023, 1.8, 16)), glassBase, [0, 1.16, 0]);
    addMesh(bottle, geometry(new CylinderGeometry(.242, .252, .28, 96)), black, [0, 2.18, 0]);
    addMesh(bottle, geometry(new CylinderGeometry(.235, .235, .035, 96)), collarEdge, [0, 2.035, 0]);
    addMesh(bottle, geometry(new CylinderGeometry(.246, .246, .025, 96)), collarEdge, [0, 2.325, 0]);
    // Fine vertical ribs are part of the closure geometry and stay fixed to the cap.
    for (let index = 0; index < 64; index += 1) {
      const angle = index / 64 * Math.PI * 2;
      const ridge = addMesh(bottle, geometry(new BoxGeometry(.006, .246, .009)), collarEdge, [Math.sin(angle) * .248, 2.18, Math.cos(angle) * .248]);
      ridge.rotation.y = angle;
      ridge.castShadow = false;
    }
    lathe(bottle, [[0, 2.326], [.18, 2.326], [.177, 2.39], [.145, 2.45], [.137, 2.55], [.132, 2.78], [.115, 2.89], [.075, 2.96], [0, 2.99]], black);
    const capRing = addMesh(bottle, geometry(new TorusGeometry(.245, .009, 8, 80)), black, [0, 2.05, 0]);
    capRing.rotation.x = Math.PI / 2;
    } else {
      // Normalize each template to a 0.9 × 2.99 envelope; measured dimensions
      // are applied once to the group, including labels and closures.
      const jar = template === 'jar-box';
      lathe(bottle, [[0,.015],[.36,.015],[.42,.05],[.45,.15],[.45,jar?2.32:1.94],[.43,jar?2.42:2.03],[jar?.39:.24,jar?2.46:2.13],[0,jar?2.46:2.13]], glass);
      const labelPaint = material(new MeshBasicMaterial({map:labelMap,side:DoubleSide,toneMapped:false}));
      const label = addMesh(bottle,geometry(new CylinderGeometry(.453,.453,jar?1.62:1.35,128,1,true,-Math.PI*.48,Math.PI*.96)),labelPaint,[0,jar?1.27:1.05,0]);
      label.castShadow=false;
      if(jar) {
        lathe(bottle,[[0,2.4],[.44,2.4],[.45,2.46],[.45,2.87],[.42,2.98],[0,2.99]],black);
        addMesh(bottle,geometry(new CylinderGeometry(.45,.45,.035,96)),collarEdge,[0,2.47,0]);
      } else {
        addMesh(bottle,geometry(new CylinderGeometry(.245,.25,.28,96)),black,[0,2.22,0]);
        addMesh(bottle,geometry(new CylinderGeometry(.085,.085,.32,48)),black,[0,2.51,0]);
        addMesh(bottle,geometry(new RoundedBoxGeometry(.24,.18,.62,4,.045)),black,[0,2.76,.15]);
        addMesh(bottle,geometry(new CylinderGeometry(.042,.042,.15,32)),black,[0,2.64,.4]);
        for(let i=0;i<48;i++){
          const a=i/48*Math.PI*2;
          const ridge=addMesh(bottle,geometry(new BoxGeometry(.005,.24,.01)),collarEdge,[Math.sin(a)*.25,2.22,Math.cos(a)*.25]);
          ridge.rotation.y=a;ridge.castShadow=false;
        }
      }
    }

    function pose(progress: number) {
      const p = clamp(progress);
      const peel = ease(.015, .18, p);
      const sealAway = ease(.14, .265, p);
      const lid = ease(.17, .44, p);
      const wings = ease(.26, .48, p);
      const lift = ease(.42, .71, p);
      const moveBehind = ease(.68, .86, p);
      const lower = ease(.81, .985, p);
      const elevated = lift * (1 - lower);
      rearLid.rotation.x = -1.92 * lid;
      tuckTab.rotation.x = -.26 * lid;
      leftFlap.rotation.z = 2.08 * wings;
      rightFlap.rotation.z = -2.08 * wings;
      frontFlap.rotation.x = 1.94 * wings;
      const liftHeight = Math.max(4.56, 3.35 + boxDepth + .45);
      const rearDistance = Math.max(1.93, boxDepth * .75 + diameter * .7);
      const sideDistance = config ? boxWidth * .42 + diameter * .35 : .52;
      bottle.position.set(-.62 + sideDistance * moveBehind, .035 + liftHeight * elevated, .28 - rearDistance * moveBehind);
      // A slight reveal of the label is continuous; the bottle remains upright throughout.
      bottle.rotation.y = .42 + .04 * moveBehind;

      const positions = stripShape.getAttribute('position');
      const length = .66;
      const attached = length * (1 - peel);
      for (let row = 0; row <= stripSegments; row += 1) {
        const distance = length * row / stripSegments;
        const free = Math.max(0, distance - attached);
        const bend = free / length;
        const topRun = Math.min(distance, .38);
        const downRun = Math.max(0, distance - .38);
        const x = -.43 - .45 * peel * bend * bend - .55 * sealAway;
        const y = height + .036 - downRun + .55 * peel * bend * bend + .25 * sealAway;
        const z = .22 + topRun + .22 * Math.sin(bend * Math.PI * 1.5) * peel + .25 * sealAway;
        positions.setXYZ(row * 2, x - .085, y, z);
        positions.setXYZ(row * 2 + 1, x + .085, y, z);
      }
      positions.needsUpdate = true;
      stripShape.computeVertexNormals();
      sealPaint.opacity = 1 - ease(.205, .27, p);

      // The fixed view direction and continuous framing keep the rising bottle in view.
      const target = new Vector3(-.62 + sideDistance * .5 * moveBehind, 1.73 + liftHeight * .47 * elevated + .62 * lid, .28 - rearDistance * .2 * moveBehind);
      camera.position.copy(target).add(new Vector3(6, 3.6, 13));
      camera.lookAt(target);
      const viewHeight = smoothMax(4.18 + Math.max(1.45, boxDepth * .8) * lid + liftHeight * elevated, (Math.max(2.7, boxWidth * 1.45 + boxDepth * .4) + boxWidth * .6 * wings + sideDistance * .1 * moveBehind) / aspect);
      camera.left = -viewHeight * aspect / 2;
      camera.right = viewHeight * aspect / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      model.updateMatrixWorld(true);
    }

    function render(progress: number) {
      if (disposed || !renderer) return;
      currentProgress = clamp(progress);
      pose(currentProgress);
      renderer.render(scene, camera);
      canvas.dataset.pose = [rearLid.rotation.x, leftFlap.rotation.z, rightFlap.rotation.z,
        bottle.position.x, bottle.position.y, bottle.position.z].map(value => value.toFixed(4)).join(',');
    }
    function resize(widthValue: number, heightValue: number, dpr: number) {
      if (disposed || !renderer || widthValue < 1 || heightValue < 1) return;
      aspect = widthValue / heightValue;
      renderer.setPixelRatio(Math.max(1, Math.min(2, dpr)));
      renderer.setSize(widthValue, heightValue, false);
      render(currentProgress);
    }
    return { resize, render, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
