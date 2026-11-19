// R04-specific art direction. Material comes from a clean unprinted studio plate;
// every letter, symbol and barcode below comes from the two customer photographs.
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';

const platePath=fileURLToPath(new URL('./r04-clean-material.webp',import.meta.url));
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const ramp=(v,lo,hi)=>{const s=clamp((v-lo)/(hi-lo),0,1);return s*s*(3-2*s);};
const mix=(a,b,t)=>a+(b-a)*t;
// Work in the same registration as the source crops, independent of output UV size.
const printRegions=[
  [[36,91,378,156],[38,162,374,191],[33,466,294,525],[88,524,211,552],[295,463,393,547],[108,946,316,986]],
  [[46,80,212,173],[302,101,366,172],[47,189,360,404],[48,411,360,529],[47,536,361,640],[365,502,383,636],[48,749,354,998],[351,714,405,1017]]
];
const origins=[770,862],blankRows=[[305,335,361],[644,648,651]];
function linear(data,w,h,x,y,ch){
  x=clamp(x,0,w-1.001);y=clamp(y,0,h-1.001);
  const a=Math.floor(x),b=Math.floor(y),i=3*(b*w+a)+ch,f=x-a,g=y-b;
  return mix(mix(data[i],data[i+3],f),mix(data[i+3*w],data[i+3*w+3],f),g);
}
export async function retouchR04(images){
  const {data:material,info:m}=await sharp(platePath).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
  return images.map(({data:source,info},face)=>{
    const {width:w,height:h}=info,out=Buffer.from(source),origin=origins[face];
    // Estimate the illumination of the photographed paper column-by-column in clear
    // stock. This allows the actual printing to be lifted without the old stains.
    const refs=new Float32Array(w*3);
    for(let px=origin-16;px<origin+690;px++){
      for(let ch=0;ch<3;ch++){
        const samples=[];
        for(const row of blankRows[face])for(let dy=-5;dy<=5;dy+=2)for(let dx=-3;dx<=3;dx+=3)
          samples.push(source[3*(Math.round(1850+row/.6+dy)*w+px+dx)+ch]);
        samples.sort((a,b)=>a-b);refs[px*3+ch]=samples[samples.length>>1];
      }
    }
    for(let py=1500;py<3900;py++){
      const y=(py-1850)*.6;
      for(let px=origin-8;px<origin+682;px++){
        const x=(px-origin)*.6,n=clamp((x-7)/392,0,1),i=(py*w+px)*3;
        // The original label edge determines coverage, never an arbitrary horizontal stripe.
        const cyan=source[i+1]-source[i];
        const inEdge=y<59||y>942||(face===1&&x<42);
        let paper=inEdge?1-ramp(cyan,12,38):1;
        if(y<30||y>(face?1042:1021))paper=0;
        // The silhouette is narrower at the foot. Do not turn photographic background
        // just outside that edge into a rectangular strip of white paper.
        if(n<.06||n>.94)paper*=1-ramp(y,(face?981:968)+36*Math.sqrt(1-(2*n-1)**2),(face?989:976)+36*Math.sqrt(1-(2*n-1)**2));
        // The yellow authentication sticker belongs to the paper, even along the gel edge.
        const sticker=face===1&&x>=351&&y>708&&y<1021&&(source[i]-source[i+2]>26);
        if(sticker)paper=1;
        // The clean paper and liquid are sampled separately so the top reservoir has
        // the same fill colour as the foot, with a continuous rim highlight at the shoulder.
        const mx=clamp(n*(m.width-1),0,m.width-1.01);
        const stockY=m.height*(.39+.37*clamp((y-36)/1000,0,1));
        const liquidY=m.height*(y<59?mix(.232,.322,clamp((py-1540)/370,0,1)):mix(.878,.953,clamp((py-3500)/340,0,1)));
        const zone=printRegions[face].some(([l,t,r,b])=>x>=l&&x<=r&&y>=t&&y<=b);
        const ink=zone?ramp((refs[px*3]-source[i])*.24+(refs[px*3+1]-source[i+1])*.61+(refs[px*3+2]-source[i+2])*.15,8,21):0;
        for(let ch=0;ch<3;ch++){
          const stock=linear(material,m.width,m.height,mx,stockY,ch);
          const gel=linear(material,m.width,m.height,mx,liquidY,ch);
          const src=source[i+ch],ref=refs[px*3+ch];
          const printed=sticker?src:stock*(1+ink*(src/Math.max(1,ref)-1));
          out[i+ch]=clamp(Math.round(mix(gel,printed,paper)),0,255);
        }
      }
    }
    return {data:out,info};
  });
}
