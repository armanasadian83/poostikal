import * as THREE from 'three';
import { makeScalp, makeStructure, lightHairModels, type HairView } from './analysis-hair-models';

export type HairRenderer = {
  select(ids: string[]): void;
  turn(direction: number): void;
  dispose(): void;
};

const scalpAngles: Record<string, number> = {
  'hairline-front': -.23, 'scalp-part': .12, 'scalp-crown': -1.35,
  'temple-left': -1.15, 'temple-right': 1.15, 'scalp-back': Math.PI,
};

export function createHairRenderer(canvas: HTMLCanvasElement, view: HairView, onPick: (id:string)=>void, onHover:(id:string)=>void): HairRenderer {
  const context=canvas.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'low-power'});
  if(!context)throw new Error('WebGL unavailable');
  const renderer = new THREE.WebGLRenderer({canvas,context,alpha:true,antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  const model = view==='scalp'?makeScalp():makeStructure();
  const scene = new THREE.Scene();
  scene.add(model);
  const reflections=lightHairModels(renderer,scene);
  const camera=new THREE.OrthographicCamera(-2,2,1.75,-1.75,.1,30);
  const elevation=view==='scalp'?.19:.16;
  let pitch=elevation;
  function pose() {
    camera.position.set(0,8*Math.sin(pitch),8*Math.cos(pitch));camera.lookAt(0,0,0);
  }
  pose();
  model.rotation.y=view==='scalp'?-.54:-.30;
  const materials=new Set<THREE.Material>();
  const geometries=new Set<THREE.BufferGeometry>();
  const targets:THREE.Mesh[]=[];
  model.traverse(object=>{
    if(object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      geometries.add(object.geometry);
      for(const finish of Array.isArray(object.material)?object.material:[object.material])materials.add(finish);
      if(object instanceof THREE.Mesh) targets.push(object);
    }
  });
  const zones=new Map<THREE.MeshStandardMaterial,THREE.Color>();
  for(const finish of materials)if(finish instanceof THREE.MeshStandardMaterial && finish.userData.area)zones.set(finish,finish.color.clone());
  const zoneIds=new Set([...zones.keys()].map(finish=>String(finish.userData.area)));
  const accent=new THREE.Color();
  let selected:string[]=[],hover='',lastClick='',frame=0;
  const draw=()=>renderer.render(scene,camera);
  function paint() {
    accent.set(getComputedStyle(canvas).getPropertyValue('--theme-accent').trim() || '#ed4c97');
    for(const [finish,base] of zones) {
      const active=selected.includes(finish.userData.area), focused=hover===finish.userData.area;
      finish.color.copy(base).lerp(accent,active?.63:focused?.30:0);
      finish.emissive.copy(accent);finish.emissiveIntensity=active?.17:focused?.08:0;
    }
    draw();
  }
  function resize(){
    const width=canvas.clientWidth,height=canvas.clientHeight;
    if(!width||!height)return;
    renderer.setSize(width,height,false);
    const halfHeight=Math.max(1.68,1.45*height/width);
    camera.top=halfHeight;camera.bottom=-halfHeight;
    camera.right=halfHeight*width/height;camera.left=-camera.right;
    camera.updateProjectionMatrix();draw();
  }
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  function orient(yaw:number,angle:number) {
    cancelAnimationFrame(frame);
    const old=model.rotation.y,oldPitch=pitch;
    const distance=Math.atan2(Math.sin(yaw-old),Math.cos(yaw-old));
    const started=performance.now();
    function tick(now:number){
      const t=reduced.matches?1:Math.min(1,(now-started)/350), eased=t*t*(3-2*t);
      model.rotation.y=old+distance*eased; pitch=oldPitch+(angle-oldPitch)*eased;pose();draw();
      if(t<1)frame=requestAnimationFrame(tick);
    }
    tick(started);
  }
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
  function hit(event:PointerEvent) {
    const box=canvas.getBoundingClientRect();
    pointer.set((event.clientX-box.left)/box.width*2-1,1-(event.clientY-box.top)/box.height*2);
    ray.setFromCamera(pointer,camera);
    const first=ray.intersectObjects(targets,false)[0];
    if(!first || !(first.object instanceof THREE.Mesh))return '';
    const finish=Array.isArray(first.object.material)?first.object.material[first.face?.materialIndex??0]:first.object.material;
    return String(finish.userData.area??'');
  }
  function highlight(id:string) {
    if(id===hover)return;
    hover=id;canvas.dataset.hit=id;onHover(id);paint();
  }
  let gesture:{id:number;x:number;y:number;yaw:number;pitch:number;moved:boolean}|null=null;
  function down(e:PointerEvent) {
    if(!e.isPrimary||e.button!==0)return;
    cancelAnimationFrame(frame);
    gesture={id:e.pointerId,x:e.clientX,y:e.clientY,yaw:model.rotation.y,pitch,moved:false};
    canvas.setPointerCapture(e.pointerId);
  }
  function move(e:PointerEvent) {
    if(!gesture){if(e.pointerType==='mouse')highlight(hit(e));return;}
    if(gesture.id!==e.pointerId)return;
    const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
    if(Math.hypot(dx,dy)<6&&!gesture.moved)return;
    gesture.moved=true;highlight('');
    model.rotation.y=gesture.yaw+dx*.014;
    if(view==='structure')model.rotation.y=THREE.MathUtils.clamp(model.rotation.y,-1.05,1.05);
    pitch=THREE.MathUtils.clamp(gesture.pitch+dy*.007,.02,view==='scalp'?1.4:.63);
    pose();draw();
  }
  function end(e:PointerEvent) {
    if(!gesture||gesture.id!==e.pointerId)return;
    const tap=!gesture.moved&&e.type==='pointerup';
    gesture=null;
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(tap) {const id=hit(e); if(id){lastClick=id;onPick(id);}}
  }
  const leave=()=>highlight('');
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  canvas.addEventListener('pointerleave',leave);
  return {
    select(ids) {
      const added=ids.filter(id=>!selected.includes(id) && zoneIds.has(id)).at(-1);
      selected=ids;paint();
      if(view==='scalp' && added && added in scalpAngles && added!==lastClick) {
        orient(scalpAngles[added],added==='scalp-crown'?1.09:added==='scalp-part'?.89:.43);
      } else if(view==='structure' && added && added!==lastClick) {
        orient(-.30,elevation);
      }
      lastClick='';
    },
    turn(direction) {
      const next=model.rotation.y+direction*.65;
      orient(view==='scalp'?next:THREE.MathUtils.clamp(next,-1.05,1.05),elevation);
    },
    dispose() {
      observer.disconnect();cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);
      canvas.removeEventListener('pointerup',end);canvas.removeEventListener('pointercancel',end);canvas.removeEventListener('pointerleave',leave);
      for(const geometry of geometries)geometry.dispose();
      for(const finish of materials)finish.dispose();
      reflections.dispose();renderer.dispose();
    },
  };
}
