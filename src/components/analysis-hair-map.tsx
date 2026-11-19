'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { hairAreas } from '@/lib/analysis-guide';
import { ChoiceCard } from './analysis-choice';
import { Icon } from './icons';
import type { HairView } from './analysis-hair-models';
import type { HairRenderer } from './analysis-hair-renderer';

const titles = {scalp:'پوست سر',structure:'ساختار تار مو'};
const scalpPlates = ['scalp','scalp-right','scalp-back'];
const scalpPlateFor = (id?:string) => id==='scalp-back'?2:id==='temple-right'?1:0;
const imagePath = (plate:string) => '/images/analysis/hair-map-'+plate;

// The red channel of each baked zone mask encodes its index in the matching option group.
function PosterZones({plate,view,selected,onPick}:{plate:string;view:HairView;selected:string[];onPick:(id:string)=>void}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const [pixels,setPixels]=useState<ImageData|null>(null);
  useEffect(()=>{
    const source=new window.Image();
    source.onload=()=>{
      const buffer=document.createElement('canvas');
      buffer.width=source.naturalWidth;buffer.height=source.naturalHeight;
      const ctx=buffer.getContext('2d');
      if(ctx){ctx.drawImage(source,0,0);setPixels(ctx.getImageData(0,0,buffer.width,buffer.height));}
    };
    source.src=imagePath(plate)+'-zones.png';
    return ()=>{source.onload=null;};
  },[plate]);
  useEffect(()=>{
    const element=canvas.current, ctx=element?.getContext('2d');
    if(!pixels || !element || !ctx)return;
    element.width=pixels.width;element.height=pixels.height;
    const overlay=ctx.createImageData(pixels.width,pixels.height);
    const active=new Set(hairAreas[view].flatMap((item,i)=>selected.includes(item.id)?[i+1]:[]));
    for(let i=0;i<pixels.data.length;i+=4) {
      if(active.has(Math.round(pixels.data[i]/32)))overlay.data[i+3]=175;
    }
    ctx.putImageData(overlay,0,0);
    ctx.globalCompositeOperation='source-in';
    ctx.fillStyle=getComputedStyle(element).getPropertyValue('--theme-accent').trim()||'#ed4c97';
    ctx.fillRect(0,0,element.width,element.height);
    ctx.globalCompositeOperation='source-over';
  },[pixels,selected,view]);
  return <canvas className="hair-plate-zones" ref={canvas} aria-hidden onClick={event=>{
    if(!pixels)return;
    const box=event.currentTarget.getBoundingClientRect();
    const x=Math.floor((event.clientX-box.left)*pixels.width/box.width),y=Math.floor((event.clientY-box.top)*pixels.height/box.height);
    const item=hairAreas[view][Math.round(pixels.data[(y*pixels.width+x)*4]/32)-1];
    if(item)onPick(item.id);
  }}/>;
}

function HairPanel({view,selected,onToggle}:{view:HairView;selected:string[];onToggle:(id:string)=>void}) {
  const canvas=useRef<HTMLCanvasElement>(null),engine=useRef<HairRenderer|null>(null);
  const [mode,setMode]=useState<'loading'|'model'|'poster'>('loading');
  const [plateIndex,setPlateIndex]=useState(()=>scalpPlateFor(selected.filter(id=>hairAreas.scalp.some(area=>area.id===id)).at(-1)));
  const [hover,setHover]=useState('');
  const latest=useRef({selected,onToggle});
  useEffect(()=>{latest.current={selected,onToggle};},[selected,onToggle]);
  useEffect(()=>{engine.current?.select(selected);},[selected]);
  useEffect(()=>{
    const element=canvas.current;
    if(!element)return;
    let active=true;
    function fallback() {engine.current?.dispose();engine.current=null;setMode('poster');}
    element.addEventListener('webglcontextlost',fallback);
    import('./analysis-hair-renderer').then(({createHairRenderer})=>{
      if(!active)return;
      engine.current=createHairRenderer(element,view,id=>latest.current.onToggle(id),setHover);
      engine.current.select(latest.current.selected);setMode('model');
    }).catch(()=>{if(active)fallback();});
    return ()=>{active=false;element.removeEventListener('webglcontextlost',fallback);engine.current?.dispose();engine.current=null;};
  },[view]);
  const options=hairAreas[view],count=options.filter(item=>selected.includes(item.id)).length;
  const plate=view==='structure'?'structure':scalpPlates[plateIndex];
  function pick(id:string) {
    if(view==='scalp' && !selected.includes(id))setPlateIndex(scalpPlateFor(id));
    onToggle(id);
  }
  function turn(direction:number) {
    if(engine.current)engine.current.turn(direction);
    else if(view==='scalp')setPlateIndex(i=>(i+direction+scalpPlates.length)%scalpPlates.length);
  }
  return <section className="hair-anatomy-panel" aria-labelledby={'hair-title-'+view}>
    <header><h2 id={'hair-title-'+view}>{titles[view]}</h2>
      {count>0 && <span>{count.toLocaleString('fa-IR')} انتخاب</span>}</header>
    <div className="hair-model-stage" data-model={view} data-mode={mode} role="group" aria-label={'مدل '+titles[view]}>
      {mode!=='model' && <div className="hair-model-plate">
        <Image src={imagePath(plate)+'.webp'} width={512} height={512} alt="" unoptimized/>
        {mode==='poster' && <PosterZones key={plate} plate={plate} view={view} selected={selected} onPick={onToggle}/>}
      </div>}
      <canvas className="hair-model-canvas" ref={canvas} aria-hidden style={{visibility:mode==='model'?'visible':'hidden'}}/>
      {hover && mode==='model' && <span className="hair-region-name" aria-hidden>{options.find(item=>item.id===hover)?.label}</span>}
      {(view==='scalp' || mode==='model') && <div className="hair-turn">
        <button type="button" aria-label={'چرخش '+titles[view]+' به راست'} onClick={()=>turn(1)}><Icon name="arrow-right" size={15}/></button>
        <button type="button" aria-label={'چرخش '+titles[view]+' به چپ'} onClick={()=>turn(-1)}><Icon name="arrow-left" size={15}/></button>
      </div>}
    </div>
    <fieldset className="hair-zone-options"><legend className="analysis-sr">{titles[view]}</legend>
      {options.map(item=><ChoiceCard key={item.id} group={'area-'+view} item={item} selected={selected.includes(item.id)} onChange={()=>pick(item.id)} multiple/>)}
    </fieldset>
  </section>;
}

export function AnalysisHairMap({selected,onToggle}:{selected:string[];onToggle:(id:string)=>void}) {
  return <div className="hair-anatomy"><HairPanel view="scalp" selected={selected} onToggle={onToggle}/>
    <HairPanel view="structure" selected={selected} onToggle={onToggle}/></div>;
}
