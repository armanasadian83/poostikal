import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {rectifyArtwork} from '../dist/animations.js';
import {animationFingerprint} from '../dist/animation-schema.js';

test('perspective artwork mapping preserves the four print corners and excludes the surround',async()=>{
  const source=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="black"/><path d="M80 40L320 80L360 360L40 320Z" fill="white"/><path d="M80 40L200 60L200 200L60 180Z" fill="red"/><path d="M200 60L320 80L340 220L200 200Z" fill="lime"/><path d="M200 200L340 220L360 360L200 340Z" fill="blue"/><path d="M60 180L200 200L200 340L40 320Z" fill="yellow"/></svg>');
  const result=await rectifyArtwork(await sharp(source).png().toBuffer(),[[.2,.1],[.8,.2],[.9,.9],[.1,.8]],200,200);
  const {data,info}=await sharp(result.buffer).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const pixel=(x,y)=>[...data.subarray((y*info.width+x)*3,(y*info.width+x)*3+3)];
  assert.deepEqual(pixel(20,20),[255,0,0]);assert.deepEqual(pixel(180,20),[0,255,0]);
  assert.deepEqual(pixel(180,180),[0,0,255]);assert.deepEqual(pixel(20,180),[255,255,0]);
});
test('build identity ignores display metadata but changes when artwork or dimensions change',()=>{
  const input={template:'dropper-box',references:[{slot:'closed',image:{url:'/api/media/a.webp',alt:'one'}}],dimensions:{boxWidth:45,boxHeight:85}};
  const hash=animationFingerprint(input);
  assert.equal(hash,animationFingerprint({...input,dimensions:{boxHeight:85,boxWidth:45},references:[{slot:'closed',image:{url:'/api/media/a.webp',alt:'two'}}]}));
  assert.equal(hash,animationFingerprint({...input,thumbnail:{url:'/api/media/cover.webp',alt:'Storefront cover'}}));
  assert.notEqual(hash,animationFingerprint({...input,dimensions:{...input.dimensions,boxWidth:46}}));
  assert.notEqual(hash,animationFingerprint({...input,references:[{slot:'closed',image:{url:'/api/media/b.webp'}}]}));
});
test('pouch identity includes opening direction, width and thickness without invalidating bottle builds',()=>{
  const input={template:'pouch-box',references:[],dimensions:{boxWidth:160,boxHeight:105,boxDepth:16,productWidth:150,productHeight:96,productDepth:5}};
  const hash=animationFingerprint(input);
  assert.equal(hash,animationFingerprint({...input,openingSide:'left'}));
  assert.notEqual(hash,animationFingerprint({...input,openingSide:'right'}));
  for(const key of ['productWidth','productDepth'])assert.notEqual(hash,animationFingerprint({...input,dimensions:{...input.dimensions,[key]:input.dimensions[key]-1}}));
  const bottle={...input,template:'dropper-box'};
  assert.equal(animationFingerprint(bottle),animationFingerprint({...bottle,openingSide:'right',dimensions:{...bottle.dimensions,productDepth:2}}));
});
