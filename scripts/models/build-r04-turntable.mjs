// Build the R04 scroll clip from the two upright, uncropped 2268 × 4032 photographs.
// node scripts/models/build-r04-turntable.mjs front.png back.png output.glb
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import {retouchR04} from './r04-surface.mjs';
import { BufferGeometry, Float32BufferAttribute, LatheGeometry, Vector2 } from 'three';

const [front, back, output] = process.argv.slice(2);
if (!output) throw new Error('Expected front.png back.png output.glb');
const originals = await Promise.all([front,back].map(path => sharp(path).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true})));
for (const {info} of originals) if(info.width!==2268 || info.height!==4032 || info.channels!==3) throw new Error('Use the original upright images at full resolution.');
const images=await retouchR04(originals);
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>(t=Math.min(1,Math.max(0,t)),t*t*(3-2*t));
function interpolate(knots,t,col) {
  let k=0;while(k<knots.length-2 && knots[k+1][0]<t) k++;
  const a=knots[k],b=knots[k+1];return lerp(a[col],b[col],(t-a[0])/(b[0]-a[0]));
}
// Surveyed from visible body edges, label boundaries and base. Each row:
// top-down surface fraction, center x, half width, y at silhouette, y at center.
const calibration=[
  [[0,1105,330,1558,1567],[.15,1107,326,1907,1918],[.47,1113,325,2633,2674],[.70,1117,324,3145,3196],[.86,1119,323,3474,3544],[1,1119,325,3764,3826]],
  [[0,1199,334,1543,1553],[.15,1200,331,1901,1917],[.47,1200,330,2633,2680],[.70,1200,329,3163,3207],[.86,1200,328,3491,3568],[1,1201,330,3800,3864]],
];
const W=3072,H=2560, pixels=Buffer.alloc(W*H*3);
const circle=Array.from({length:W},(_,i)=>{
  const theta=(i+.5)/W*Math.PI*2, c=Math.cos(theta);
  return {s:Math.sin(theta),c:Math.abs(c),f:smooth((c+.14)/.28)};
});
for(let y=0;y<H;y++){
  const t=(y+.5)/H,rows=calibration.map(knots=>[1,2,3,4].map(col=>interpolate(knots,t,col)));
  for(let u=0;u<W;u++){
    const {s,c,f}=circle[u];
    for(let face=0;face<2;face++){
      const weight=face===0?f:1-f;if(weight===0)continue;
      const [cx,r,y0,y1]=rows[face],px=cx+(face===0?1:-1)*r*.968*s,py=lerp(y0,y1,c);
      const ix=Math.floor(px),iy=Math.floor(py),fx=px-ix,fy=py-iy;
      const {data,info}=images[face],stride=info.width*3,offset=iy*stride+ix*3;
      // The angular seam crosses blank label stock, never retypes or invents print.
      for(let ch=0;ch<3;ch++){
        const o=offset+ch;
        const v=lerp(lerp(data[o],data[o+3],fx),lerp(data[o+stride],data[o+stride+3],fx),fy);
        pixels[(y*W+u)*3+ch]+=Math.round(v*weight);
      }
    }
  }
}
const tex=await sharp(pixels,{raw:{width:W,height:H,channels:3}})
  .sharpen({sigma:.8,m1:.5,m2:1.1})
  .jpeg({quality:97,chromaSubsampling:'4:4:4',mozjpeg:true}).toBuffer();
const gltf={asset:{version:'2.0',generator:'Poostikal / R04 photo turntable'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'Display',rotation:[Math.sin(.028),0,0,Math.cos(.028)],children:[1]},{name:'R04 — half turn',children:[]}],meshes:[],animations:[],buffers:[],bufferViews:[],accessors:[],materials:[],textures:[],images:[],extensionsUsed:['KHR_materials_unlit']};
let offset=0;const chunks=[];
function view(bytes,target){const pad=(4-offset%4)%4;if(pad)chunks.push(Buffer.alloc(pad));offset+=pad;const id=gltf.bufferViews.length;gltf.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,...(target?{target}:{})});chunks.push(bytes);offset+=bytes.length;return id;}
function accessor(arr,type,extrema,target){const n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[type];const a={bufferView:view(Buffer.from(arr.buffer,arr.byteOffset,arr.byteLength),target),componentType:arr instanceof Uint32Array?5125:arr instanceof Uint16Array?5123:5126,count:arr.length/n,type};if(extrema){a.min=Array(n).fill(Infinity);a.max=Array(n).fill(-Infinity);arr.forEach((v,i)=>{const k=i%n;a.min[k]=Math.min(a.min[k],v);a.max[k]=Math.max(a.max[k],v);});}return gltf.accessors.push(a)-1;}
gltf.images.push({bufferView:view(tex),mimeType:'image/jpeg'});gltf.textures.push({source:0});
const material=(name,color,rough,extra={})=>gltf.materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...color,1],metallicFactor:0,roughnessFactor:rough},...extra})-1;
const bodyMat=gltf.materials.push({name:'Original front and back artwork',pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:.62},extensions:{KHR_materials_unlit:{}}})-1;
const white=material('White satin pump',[.70,.73,.72],.42),stem=material('Pale translucent-looking plastic',[.64,.69,.68],.32),hole=material('Recessed outlet',[.13,.16,.16],.78);
function mesh(name,g,mat){const attrs={};for(const [src,dst] of [['position','POSITION'],['normal','NORMAL'],['uv','TEXCOORD_0'],['color','COLOR_0']]){if(g.attributes[src]&&(src!=='uv'||mat===bodyMat)){const a=g.attributes[src];attrs[dst]=accessor(a.array,'VEC'+a.itemSize,src==='position',34962);}}
  const primitive={attributes:attrs,material:mat};if(g.index)primitive.indices=accessor(g.index.array,'SCALAR',false,34963);
  gltf.nodes[1].children.push(gltf.nodes.length);gltf.nodes.push({name,mesh:gltf.meshes.length});gltf.meshes.push({name,primitives:[primitive]});g.dispose();}
const lathe=(profile,segments=128)=>new LatheGeometry(profile.map(([r,y])=>new Vector2(r,y)),segments);
const yLow=.24,yHigh=7.03;
const barrel=lathe([[.998,yLow],[.994,1.2],[.990,3.8],[.996,6.65],[1,yHigh]]);
for(let i=0;i<barrel.attributes.uv.count;i++)barrel.attributes.uv.setY(i,(yHigh-barrel.attributes.position.getY(i))/(yHigh-yLow));
mesh('Printed wrap and gel reservoir',barrel,bodyMat);
function edge(name,profile,top){const g=lathe(profile),colors=[];for(let i=0;i<g.attributes.position.count;i++){const y=g.attributes.position.getY(i),t=top?(y-yHigh)/.21:1-y/yLow;g.attributes.uv.setY(i,top?.002:.998);const k=top?1+.15*t:1-.22*t;colors.push(k,k,k);}g.setAttribute('color',new Float32BufferAttribute(colors,3));mesh(name,g,bodyMat);}
edge('Rounded bottle foot',[[.001,0],[.83,0],[.91,.023],[.966,.076],[.991,.15],[.998,yLow]],false);
edge('Rounded shoulder',[[1,yHigh],[.998,7.065],[.98,7.10],[.935,7.14],[.86,7.17],[.62,7.218],[.49,7.24],[.001,7.24]],true);
const collar=lathe([[.48,7.228],[.506,7.25],[.514,7.29],[.514,7.32],[.509,7.34],[.503,8.065],[.497,8.10],[.475,8.125],[.362,8.143],[.001,8.145]],480);
for(let i=0;i<collar.attributes.position.count;i++){const a=collar.attributes.position,y=a.getY(i);if(y<7.32||y>8.10)continue;const x=a.getX(i),z=a.getZ(i),k=1+.006*Math.cos(120*Math.atan2(x,z));a.setXYZ(i,x*k,y,z*k);}
collar.computeVertexNormals();mesh('Ribbed screw collar',collar,white);
mesh('Pump stem',lathe([[.001,8.135],[.34,8.135],[.315,8.18],[.255,8.196],[.24,8.204],[.24,8.60],[.23,8.64],[.001,8.64]]),stem);
// Continuous cross-sections along the actuator, gently domed across its width.
const slices=[[-.50,.045,8.56,8.59],[-.46,.16,8.535,8.65],[-.39,.23,8.54,8.72],[-.27,.265,8.55,8.766],[-.10,.282,8.58,8.78],[.10,.278,8.597,8.776],[.27,.255,8.61,8.76],[.45,.225,8.608,8.74],[.67,.20,8.586,8.708],[.88,.17,8.548,8.67],[1.02,.144,8.506,8.632],[1.078,.121,8.516,8.617]];
const pos=[],index=[],N=48;
for(const [x,w,lo,hi] of slices){for(let j=0;j<N;j++){const th=2*Math.PI*j/N,c=Math.cos(th),s=Math.sin(th);pos.push(x,(hi+lo)/2+(hi-lo)/2*Math.sign(s)*Math.abs(s)**.68,w*Math.sign(c)*Math.abs(c)**.75);}}
for(let k=0;k<slices.length-1;k++)for(let j=0;j<N;j++){const a=k*N+j,b=k*N+(j+1)%N;index.push(a,a+N,b,b,a+N,b+N);}
for(let j=1;j<N-1;j++){const a=(slices.length-1)*N;index.push(0,j,j+1,a,a+j+1,a+j);}
const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(pos,3));g.setIndex(index);g.computeVertexNormals();mesh('Contoured dispenser lever and spout',g,stem);
const outlet=lathe([[.001,0],[.038,0]],40);outlet.rotateZ(-Math.PI/2);outlet.translate(1.079,8.564,0);mesh('Outlet',outlet,hole);
const times=accessor(new Float32Array([0,1,2]),'SCALAR',true),rq=accessor(new Float32Array([0,0,0,1,0,Math.SQRT1_2,0,Math.SQRT1_2,0,1,0,0]),'VEC4',false);
gltf.animations.push({name:'Front to back / 180 degrees',samplers:[{input:times,output:rq,interpolation:'LINEAR'}],channels:[{sampler:0,target:{node:1,path:'rotation'}}]});
const padding=(4-offset%4)%4;if(padding)chunks.push(Buffer.alloc(padding));const bin=Buffer.concat(chunks);gltf.buffers=[{byteLength:bin.length}];
const raw=Buffer.from(JSON.stringify(gltf)),json=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]);const hdr=Buffer.alloc(20),bh=Buffer.alloc(8);hdr.write('glTF');hdr.writeUInt32LE(2,4);hdr.writeUInt32LE(28+json.length+bin.length,8);hdr.writeUInt32LE(json.length,12);hdr.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);await writeFile(output,Buffer.concat([hdr,json,bh,bin]));console.log('Built',output,hdr.readUInt32LE(8),'bytes');
