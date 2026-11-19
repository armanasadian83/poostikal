import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type BodySide = 'front' | 'back';
export type BodyRenderer = {
  select: (ids: string[], side: BodySide, instant?: boolean) => void;
  dispose: () => void;
};

export async function createBodyRenderer(canvas: HTMLCanvasElement, context: WebGL2RenderingContext, signal: AbortSignal): Promise<BodyRenderer> {
  const response = await fetch('/images/analysis/mannequin.glb', { signal });
  if (!response.ok) throw new Error('Mannequin unavailable');
  const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
  const body = gltf.scene.getObjectByName('Mannequin') as THREE.Mesh<THREE.BufferGeometry,THREE.Material>;
  body.material.dispose();
  if (signal.aborted) { body.geometry.dispose(); throw signal.reason; }

  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true }); }
  catch (error) { body.geometry.dispose(); throw error; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-4.3, 4.3, 8.6, -8.6, .1, 60);
  camera.position.set(0,0,25);
  const material = new THREE.MeshPhysicalMaterial({color:0xc3a9d7,roughness:.43,metalness:.06,clearcoat:.23});
  const accent = new THREE.Color();
  const shineHeight = {value:12};
  material.onBeforeCompile = shader => {
    shader.uniforms.shineHeight = shineHeight;
    shader.uniforms.zoneAccent = {value:accent};
    shader.vertexShader = 'attribute float zoneLight; varying float vZoneLight; varying float vBodyY;\n' + shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvZoneLight = zoneLight; vBodyY = position.y;');
    shader.fragmentShader = 'varying float vZoneLight; varying float vBodyY; uniform float shineHeight; uniform vec3 zoneAccent;\n' + shader.fragmentShader
      .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, zoneAccent, vZoneLight * .92);')
      .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nfloat shine = 1.0 - smoothstep(0.05, 1.25, abs(vBodyY - shineHeight)); totalEmissiveRadiance += (zoneAccent * .58 + vec3(.78,.60,.74) * shine) * vZoneLight;');
  };
  body.material = material;
  body.position.z = -.45;
  const turntable = new THREE.Group();
  turntable.add(body); scene.add(turntable);
  scene.add(new THREE.HemisphereLight(0xfff8ff,0x9b87b1,1.48));
  const key = new THREE.DirectionalLight(0xfff6f1,1.95); key.position.set(-5,8,8); scene.add(key);
  const rim = new THREE.DirectionalLight(0xe9daff,1.1); rim.position.set(5,5,-4); scene.add(rim);

  const ids: string[] = body.userData.areaIds;
  const count = body.geometry.getAttribute('position').count;
  const glow = new THREE.Float32BufferAttribute(new Float32Array(count),1).setUsage(THREE.DynamicDrawUsage);
  body.geometry.setAttribute('zoneLight',glow);
  const draw = () => renderer.render(scene,camera);
  const resize = () => {
    if (!canvas.clientWidth || !canvas.clientHeight) return;
    renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);
    camera.left = -8.6*canvas.clientWidth/canvas.clientHeight;
    camera.right = -camera.left;
    camera.updateProjectionMatrix(); draw();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);resize();
  let frame=0;
  let previousSelection: string[]=[];
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  return {
    select(selected, side, instant=false) {
      accent.set(getComputedStyle(canvas).getPropertyValue('--theme-accent').trim() || '#ed4c97');
      glow.array.fill(0);
      for(const id of selected) {
        const index=ids.indexOf(id);
        if(index<0) continue;
        const weights=body.geometry.getAttribute('_zones'+Math.floor(index/4));
        for(let i=0;i<count;i++) glow.array[i]=Math.max(glow.array[i],weights.getComponent(i,index%4));
      }
      glow.needsUpdate=true;
      cancelAnimationFrame(frame);
      const start=turntable.rotation.y, end=side==='front'?0:Math.PI;
      const added=selected.some(id=>!previousSelection.includes(id));
      previousSelection=selected;
      shineHeight.value=12;
      if(instant || media.matches || (!added && Math.abs(end-start)<.001)) {
        turntable.rotation.y=end;draw();return;
      }
      const began=performance.now();
      const rotate=(now:number)=>{
        const elapsed=media.matches?1000:now-began;
        const t=Math.min(1,elapsed/480);
        const sheen=added?Math.min(1,elapsed/850):1;
        shineHeight.value=-10+22*sheen;
        turntable.rotation.y=start+(end-start)*t*t*(3-2*t);
        draw();if(t<1 || sheen<1) frame=requestAnimationFrame(rotate);
      };
      frame=requestAnimationFrame(rotate);
    },
    dispose() {
      cancelAnimationFrame(frame); observer.disconnect(); body.geometry.dispose(); material.dispose(); renderer.dispose();
    },
  };
}
