import * as THREE from 'three';
import sections from './analysis-mannequin-sections.json';

export type HairView = 'scalp' | 'structure';
const tau = 2 * Math.PI;
const scalpIds = ['hairline-front','scalp-part','scalp-crown','temple-right','temple-left','scalp-back'];

// Light the two pieces as a pair. The broad studio cards give the lacquer its soft reflections.
export function lightHairModels(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const room = new THREE.Scene();
  room.background = new THREE.Color('#716777');
  const plane = new THREE.PlaneGeometry();
  const paper = new THREE.MeshBasicMaterial({color:new THREE.Color(4.2,4.0,4.4)});
  for(const [x,y,z,w,h] of [[-4,4,4,3.7,6.8],[4.2,3.5,-4,3.0,6.0],[3,.5,5,1.2,3.8]]) {
    const card=new THREE.Mesh(plane,paper);
    card.position.set(x,y,z);card.scale.set(w,h,1);card.lookAt(0,0,0);room.add(card);
  }
  const generator = new THREE.PMREMGenerator(renderer);
  const reflections = generator.fromScene(room,.06);
  plane.dispose();paper.dispose();
  generator.dispose();
  scene.environment = reflections.texture;
  scene.environmentIntensity = .85;
  scene.add(new THREE.HemisphereLight(0xfff5ff,0x9583a2,.72));
  const softbox = new THREE.DirectionalLight(0xfff2f4,1.18);
  softbox.position.set(-3,5,5);
  const edge = new THREE.DirectionalLight(0xe6dcff,.76);
  edge.position.set(3,2,-4);
  scene.add(softbox,edge);
  return reflections;
}

function porcelain(color: string, area?: string) {
  const finish = new THREE.MeshPhysicalMaterial({
    color, roughness:.36, metalness:.055, clearcoat:.19, clearcoatRoughness:.31,
  });
  if (area) finish.userData.area = area;
  return finish;
}

function scalpZone(y:number, phi:number) {
  const angle = Math.abs(phi);
  const boundary = 6.78 + .43*Math.cos(phi) + .09*Math.cos(2*phi);
  if (y < boundary) return 0;
  if (y > 7.69 + .09*Math.cos(phi)) return 3;
  if (angle < 1.20 && y < boundary + .20) return 1;
  if (angle < .69 + .51*(y-boundary)) return 2;
  if (angle > 2.17 - .12*(y-boundary)) return 6;
  return phi < 0 ? 4 : 5;
}

// Horizontal sections sampled from the existing body mannequin. One continuous surface
// runs from the cropped shoulders through the neck and chin to the top of the head.
export function makeScalp() {
  const group = new THREE.Group();
  const columns = 96, rows = 110;
  const positions:number[] = [], faces:number[][] = Array.from({length:7},()=>[]);
  for(let col=0;col<columns;col++) {
    const phi=col*tau/columns, sample=col*32/columns;
    const k=Math.floor(sample), fraction=sample-k;
    const profile=sections.map(([height,center,...radii])=>{
      const r=(n:number)=>radii[(n+32)%32];
      // Cubic interpolation keeps the highlights continuous around the forehead and shoulders.
      const a=r(k-1), b=r(k), c=r(k+1), d=r(k+2);
      const radius=b+.5*fraction*((c-a)+fraction*((2*a-5*b+4*c-d)+fraction*(3*b-3*c+d-a)));
      return new THREE.Vector3(radius*Math.sin(phi),height,center+radius*Math.cos(phi));
    });
    const first=profile[0], baseCenter=sections[0][1];
    const bevel = (scale:number,dy:number)=>new THREE.Vector3(first.x*scale,first.y+dy,baseCenter+(first.z-baseCenter)*scale);
    const curve=new THREE.CatmullRomCurve3([bevel(.94,-.034),bevel(.986,-.029),...profile,new THREE.Vector3(0,7.94,.47)]);
    for(let row=0;row<rows;row++) {
      const point=curve.getPoint(row/rows);
      positions.push(point.x*.87,(point.y-6.23)*.87,(point.z-.41)*.87);
    }
  }
  const top=positions.length/3, bottom=top+1;
  positions.push(0,(7.94-6.23)*.87,.06*.87,0,(4.566-6.23)*.87,(sections[0][1]-.41)*.87);
  for(let col=0;col<columns;col++) {
    const left=col*rows, right=((col+1)%columns)*rows;
    const longitude=(col+.5)*tau/columns;
    const phi=Math.atan2(Math.sin(longitude),Math.cos(longitude));
    for(let row=0;row<rows-1;row++) {
      const a=left+row,b=right+row,c=a+1,d=b+1;
      const h=(positions[a*3+1]+positions[c*3+1])/(2*.87)+6.23;
      faces[scalpZone(h,phi)].push(a,b,c,b,d,c);
    }
    faces[3].push(left+rows-1,right+rows-1,top);
    faces[0].push(bottom,right,left);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setIndex(faces.flat());
  let offset=0;
  for(const [index,indices] of faces.entries()){geo.addGroup(offset,indices.length,index);offset+=indices.length;}
  geo.computeVertexNormals();
  // The zones share the glaze, so their outlines emerge only on hover and selection.
  const lilac='#b197c6';
  group.add(new THREE.Mesh(geo,[porcelain(lilac),...scalpIds.map(id=>porcelain(lilac,id))]));
  return group;
}

// A curved biopsy section, with a concave channel in its exposed face. The thin
// epidermal band wraps over the rounded rim and follows the same surface as the dermis.
function tissueSection() {
  const rows=62, cols=96, positions:number[]=[], triangles:number[][]=[[],[],[]];
  const profile=new THREE.SplineCurve([
    [.035,-1.32],[.28,-1.27],[.49,-1.12],[.66,-.86],[.80,-.53],
    [.91,-.17],[.98,.10],[.98,.16],[.94,.20],[.74,.21],[.42,.21],[.04,.21],
  ].map(([r,h])=>new THREE.Vector2(r,h)));
  for(let i=0;i<=rows;i++) {
    const t=i/rows,{x:radius,y}=profile.getPoint(t);
    const centerX=-.24+.20*(y+1.3)/1.5;
    for(let j=0;j<cols;j++) {
      const phi=j*tau/cols, x=radius*Math.sin(phi),front=Math.cos(phi);
      const hollow=Math.max(front,0)**2 * Math.exp(-((x/.32)**2));
      const z=-.34+radius*(front>0?.62:.77)*front-.24*radius*hollow;
      const wave=THREE.MathUtils.smoothstep(y,-.5,.14)*(.062*Math.sin(2.2*x)-.040*Math.cos(3.8*x));
      positions.push(centerX+x,y+wave,z);
    }
    if(!i)continue;
    const zone=t>.695?2:t>.64?1:0;
    for(let j=0;j<cols;j++) {
      const a=(i-1)*cols+j, b=(i-1)*cols+(j+1)%cols, c=a+cols,d=b+cols;
      triangles[zone].push(a,b,c,b,d,c);
    }
  }
  const underside=positions.length/3,top=underside+1;
  positions.push(-.24,-1.32,-.34,-.04,.17,-.34);
  for(let j=0;j<cols;j++) {
    const next=(j+1)%cols;
    triangles[0].push(underside,next,j);
    triangles[2].push(rows*cols+j,rows*cols+next,top);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setIndex(triangles.flat());
  let start=0;
  for(const [i,f] of triangles.entries()){geo.addGroup(start,f.length,i);start+=f.length;}
  geo.computeVertexNormals();
  return new THREE.Mesh(geo,[porcelain('#af98c1'),porcelain('#c1abc8'),porcelain('#d1bbd9')]);
}

// A swept section with a varying radius. A partial turn opens the front of the
// follicular sheath so the enclosed root and bulb can also be selected directly.
function sectionMesh(path:THREE.CatmullRomCurve3, radii:THREE.SplineCurve, open:boolean,
  materials:THREE.MeshPhysicalMaterial[], zoneAt:(t:number)=>number) {
  const along=80, arcSteps=48, lipSteps=8;
  const section:THREE.Vector2[]=[];
  const angleAt=(j:number)=>(open?.83:0)+(open?tau-1.66:tau)*j/arcSteps;
  const sample=(angle:number,r:number,tangent=0)=>new THREE.Vector2(
    r*Math.sin(angle)+tangent*Math.cos(angle),r*Math.cos(angle)-tangent*Math.sin(angle));
  for(let j=0;j<=arcSteps;j++)section.push(sample(angleAt(j),1));
  if(open) {
    // Roll the edges of the C-section back into its inner wall.
    for(let j=1;j<=lipSteps;j++){
      const a=Math.PI*j/lipSteps;section.push(sample(angleAt(arcSteps),.82+.18*Math.cos(a),.18*Math.sin(a)));
    }
    for(let j=arcSteps-1;j>=0;j--)section.push(sample(angleAt(j),.64));
    for(let j=1;j<=lipSteps;j++){
      const a=Math.PI*j/lipSteps;section.push(sample(angleAt(0),.82-.18*Math.cos(a),-.18*Math.sin(a)));
    }
  }
  const stride=section.length;
  const vertices:number[]=[], colors:number[]=[], faces:number[][]=materials.map(()=>[]);
  const point=new THREE.Vector3(), tangent=new THREE.Vector3(), side=new THREE.Vector3();
  const front=new THREE.Vector3(0,0,1), normal=new THREE.Vector3();
  for(let i=0;i<=along;i++) {
    const t=i/along;
    path.getPoint(t,point);path.getTangent(t,tangent);
    side.crossVectors(tangent,front).normalize();normal.crossVectors(side,tangent).normalize();
    const radius=Math.max(.002,radii.getPoint(t).y);
    for(let j=0;j<stride;j++) {
      const u=section[j].x*radius,v=section[j].y*radius;
      vertices.push(point.x+side.x*u+normal.x*v,point.y+side.y*u+normal.y*v,point.z+side.z*u+normal.z*v);
      if(materials[0].vertexColors) {
        const shade=1-.33*THREE.MathUtils.smoothstep(t,.12,.7);
        colors.push(shade,shade,shade);
      }
      if(i && j) {
        const a=(i-1)*stride+j-1,b=a+1,c=a+stride,d=c+1;
        faces[zoneAt((i-.5)/along)].push(a,b,c,b,d,c);
      }
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  if(colors.length)geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  if(open) {
    // Close the upper rim of the cutaway, where the strand emerges through the skin.
    for(let j=0;j<arcSteps;j++) {
      const a=along*stride+j,b=a+1,c=along*stride+arcSteps*2+lipSteps-j,d=c-1;
      faces[0].push(a,c,b,b,c,d);
    }
  }
  geo.setIndex(faces.flat());geo.computeVertexNormals();
  let start=0;for(const [i,f] of faces.entries()){geo.addGroup(start,f.length,i);start+=f.length;}
  return new THREE.Mesh(geo,materials);
}

const spine=(points:number[][])=>new THREE.CatmullRomCurve3(points.map(([x,y,z])=>new THREE.Vector3(x,y,z)));
const widths=(radii:number[])=>new THREE.SplineCurve(radii.map((radius,i)=>new THREE.Vector2(i,radius)));

export function makeStructure() {
  const group=new THREE.Group();
  group.add(tissueSection());

  const casing=porcelain('#9e7daf','hair-follicle');
  casing.side=THREE.DoubleSide;
  const canal=spine([[-.33,-1.22,.02],[-.33,-1.11,.025],[-.31,-.93,.03],
    [-.26,-.70,.045],[-.19,-.43,.055],[-.115,-.16,.065],[-.035,.10,.07]]);
  group.add(sectionMesh(canal,widths([.025,.235,.25,.174,.156,.155,.166]),true,[casing],()=>0));

  const fiber=spine([[-.33,-1.21,.076],[-.33,-1.06,.078],[-.30,-.89,.081],[-.215,-.55,.092],
    [-.105,-.13,.11],[.002,.26,.11],[.15,.63,.10],[.35,.96,.067],[.47,1.26,.02],[.46,1.52,-.014]]);
  const strand=['hair-bulb','hair-root','hair-shaft','hair-tip'].map(id=>{
    const finish=porcelain('#93759f',id);
    finish.vertexColors=true;
    return finish;
  });
  group.add(sectionMesh(fiber,widths([.006,.166,.120,.082,.073,.071,.068,.058,.030,.002]),false,
    strand,t=>t<.24?0:t<.51?1:t<.81?2:3));

  // A lobulated gland with a single continuous silhouette and a duct entering the sheath.
  const gland=porcelain('#be94bb','sebaceous-gland');
  const duct=spine([[-.15,-.26,.11],[0,-.27,.117],[.13,-.21,.12],[.23,-.18,.12]]);
  group.add(sectionMesh(duct,widths([.028,.044,.073,.104]),false,[gland],()=>0));
  const lobes=new THREE.SphereGeometry(1,80,52);
  const pos=lobes.getAttribute('position');
  // Ray distances to overlapping acini give the gland a joined, softly lobed surface.
  const acini=[
    [0,0,0,.19,.14,.12],[-.12,-.04,.005,.12,.10,.11],[-.07,.073,.025,.105,.13,.11],
    [.064,.12,-.012,.115,.115,.12],[.15,.018,.030,.118,.13,.10],
    [.077,-.091,.028,.123,.115,.109],[-.037,-.060,.079,.094,.094,.097],
  ];
  for(let i=0;i<pos.count;i++) {
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    let radius=0;
    for(const [cx,cy,cz,rx,ry,rz] of acini) {
      const a=(x/rx)**2+(y/ry)**2+(z/rz)**2;
      const b=x*cx/rx**2+y*cy/ry**2+z*cz/rz**2;
      const disc=b*b-a*((cx/rx)**2+(cy/ry)**2+(cz/rz)**2-1);
      if(disc<=0)continue;
      const reach=(b+Math.sqrt(disc))/a;
      const blend=Math.max(.055-Math.abs(radius-reach),0);
      radius=Math.max(radius,reach)+blend*blend/(4*.055);
    }
    pos.setXYZ(i,.32+radius*x,-.20+radius*y+.043*x,.14+radius*z);
  }
  lobes.computeVertexNormals();
  group.add(new THREE.Mesh(lobes,gland));
  return group;
}
