import { z } from 'zod';
import { createHash } from 'node:crypto';
const point = z.tuple([z.number().min(0).max(1),z.number().min(0).max(1)]);
const selection = z.object({slot:z.enum(['closed','open','product','angle']),corners:z.tuple([point,point,point,point])}).refine(value=>{
  const p=value.corners;
  return p.every((a,i)=>{const b=p[(i+1)%4],c=p[(i+2)%4];return (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])>.0005;});
},'چهار گوشه را به ترتیب بالا چپ، بالا راست، پایین راست و پایین چپ انتخاب کن.');
const color=z.string().regex(/^#[a-fA-F0-9]{6}$/);
export const artworkSchema=z.object({carton:selection,label:selection});
export const appearanceSchema=z.object({carton:color,base:color,bottle:color,cap:color,material:z.enum(['glass','opaque']),seal:z.boolean()});
export const buildSchema=z.object({id:z.uuid(),version:z.literal(1),cartonUrl:z.string(),labelUrl:z.string(),warnings:z.array(z.string()).max(5)});
export const defaultAppearance={carton:'#e9dfc7',base:'#38252c',bottle:'#f5fbf8',cap:'#101111',material:'glass' as const,seal:true};
export const pouchAppearance={carton:'#f5ccdf',base:'#f4ead5',bottle:'#d9dcdf',cap:'#ffffff',material:'glass' as const,seal:false};
export const defaultArtwork={carton:{slot:'closed' as const,corners:[[.2,.15],[.8,.15],[.8,.9],[.2,.9]]},label:{slot:'product' as const,corners:[[.25,.4],[.75,.4],[.75,.78],[.25,.78]]}};
export type BuildInput={template:string;openingSide?:'left'|'right';references:{slot:string;image:{url:string}|null}[];dimensions:Record<string,number|undefined>;artwork?:z.infer<typeof artworkSchema>;appearance?:z.infer<typeof appearanceSchema>};
export function animationFingerprint(value:BuildInput) {
  // Explicit key ordering makes equivalent configurations reuse one immutable build.
  return createHash('sha256').update(JSON.stringify({version:1,template:value.template,
    references:['closed','open','product','angle'].map(slot=>value.references.find(r=>r.slot===slot)?.image?.url??null),
    dimensions:['boxWidth','boxHeight','boxDepth','productHeight','productDiameter'].map(key=>value.dimensions[key]??null),
    artwork:['carton','label'].map(key=>{const a=(value.artwork??defaultArtwork)[key as 'carton'|'label'];return [a.slot,a.corners];}),
    appearance:Object.keys(defaultAppearance).map(key=>(value.appearance??defaultAppearance)[key as keyof typeof defaultAppearance]),
    // Keep existing bottle build fingerprints unchanged.
    ...(value.template==='pouch-box'?{pouch:[value.openingSide??'left',value.dimensions.productWidth??null,value.dimensions.productDepth??null]}:{}),
  })).digest('hex');
}
