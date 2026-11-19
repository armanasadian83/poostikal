import { ACESFilmicToneMapping, AnimationMixer, Box3, DirectionalLight, Group, HemisphereLight, LoopOnce, Mesh, MeshBasicMaterial, PerspectiveCamera, PMREMGenerator, Scene, SRGBColorSpace, Texture, Vector3, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { ProductUnboxingSceneHandle } from './product-unboxing-scene';

/** One pose renderer for uploaded models in both the editor and storefront. */
export async function createUploadedAnimationScene(canvas:HTMLCanvasElement,url:string,cancelled:()=>boolean):Promise<ProductUnboxingSceneHandle> {
  const gltf=await new GLTFLoader().loadAsync(url);
  let renderer:WebGLRenderer|undefined;
  let environment:ReturnType<PMREMGenerator['fromScene']>|undefined;
  const mixer=new AnimationMixer(gltf.scene);
  let disposed=false,progress=0;
  function dispose(){
    if(disposed)return;disposed=true;mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);
    const textures=new Set<Texture>();
    gltf.scene.traverse(object=>{if(object instanceof Mesh){object.geometry.dispose();for(const paint of Array.isArray(object.material)?object.material:[object.material]){for(const value of Object.values(paint))if(value instanceof Texture)textures.add(value);paint.dispose();}}});
    textures.forEach(texture=>texture.dispose());environment?.dispose();renderer?.dispose();
  }
  if(cancelled()){dispose();throw new Error('Cancelled');}
  try {
    const actions=gltf.animations.map(clip=>{const action=mixer.clipAction(clip);action.setLoop(LoopOnce,1);action.clampWhenFinished=true;return action;});
    const duration=Math.max(0,...gltf.animations.map(clip=>clip.duration));
    const pose=(p:number)=>{actions.forEach(action=>action.reset().play());mixer.setTime(p*duration);gltf.scene.updateMatrixWorld(true);};
    const bounds=new Box3();for(let i=0;i<=12;i++){pose(i/12);bounds.union(new Box3().setFromObject(gltf.scene));}pose(0);
    if(bounds.isEmpty())throw new Error('The model is empty.');
    const center=bounds.getCenter(new Vector3()),size=bounds.getSize(new Vector3());
    const root=new Group();root.add(gltf.scene);root.position.copy(center).multiplyScalar(-1);
    const scene=new Scene();scene.add(root,new HemisphereLight(0xffffff,0xded3e7,2));
    const key=new DirectionalLight(0xffffff,3);key.position.set(3,5,5);scene.add(key);
    renderer=new WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
    renderer.outputColorSpace=SRGBColorSpace;renderer.toneMapping=ACESFilmicToneMapping;renderer.setClearColor(0xffffff,0);
    // Photographed artwork in a glTF unlit material already has its final exposure.
    const anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    gltf.scene.traverse(node=>{if(node instanceof Mesh)for(const mat of Array.isArray(node.material)?node.material:[node.material]){
      if(mat instanceof MeshBasicMaterial && mat.map) mat.toneMapped=false;
      if(mat.map instanceof Texture) mat.map.anisotropy=anisotropy;
    }});
    const pmrem=new PMREMGenerator(renderer),room=new RoomEnvironment();environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;room.dispose();pmrem.dispose();
    const camera=new PerspectiveCamera(35,1,.01,10000);
    const render=(p:number)=>{if(disposed)return;progress=Math.max(0,Math.min(1,p));pose(progress);renderer!.render(scene,camera);canvas.dataset.pose=progress.toFixed(4);};
    const upright=size.y>size.x*1.65;
    canvas.dataset.framing=upright?'upright':'wide';
    const resize=(width:number,height:number,dpr:number)=>{
      if(disposed||width<1||height<1)return;
      const ratio=Math.min(2,Math.max(1.5,dpr),Math.sqrt(3_000_000/(width*height)));
      renderer!.setPixelRatio(ratio);renderer!.setSize(width,height,false);camera.aspect=width/height;
      const frame=Math.max(size.y,size.x/camera.aspect);
      const distance=frame*(upright?.512:.6)/Math.tan(35*Math.PI/360)+size.z*(upright?.5:.6);
      camera.position.z=Math.max(.1,distance);camera.near=Math.max(.001,distance/1000);camera.far=Math.max(100,distance*10);camera.updateProjectionMatrix();render(progress);
    };
    const setMagnified=(on:boolean)=>{camera.zoom=on?2:1;camera.position.y=on&&upright?-size.y*.09:0;camera.updateProjectionMatrix();render(progress);};
    return {render,resize,setMagnified,dispose};
  } catch(error){dispose();throw error;}
}
