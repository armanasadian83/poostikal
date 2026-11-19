'use client';
import Image from 'next/image';
import {useEffect,useRef,useState} from 'react';
import {areas,skinAreas} from '@/lib/analysis-guide';
import {ChoiceCard} from './analysis-choice';
import type {BodyRenderer,BodySide} from './analysis-body-renderer';

const atlasColumns = 6;
const atlasRows = Math.ceil(areas.length / atlasColumns);

function Figure({selected,side}:{selected:string[];side:BodySide}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const scene=useRef<BodyRenderer|null>(null);
  const latest=useRef({selected,side});
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    latest.current={selected,side};
    scene.current?.select(selected,side);
  },[selected,side]);
  useEffect(()=>{
    const element=canvas.current;
    if(!element)return;
    let context:WebGL2RenderingContext|null;
    try { context=element.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'low-power'}); }
    catch { return; }
    if(!context)return;
    const controller=new AbortController();
    const lost=()=>{controller.abort();scene.current?.dispose();scene.current=null;setReady(false);};
    element.addEventListener('webglcontextlost',lost);
    import('./analysis-body-renderer').then(({createBodyRenderer})=>{
      if(!controller.signal.aborted)return createBodyRenderer(element,context,controller.signal);
    }).then(model=>{
      if(!model)return;
      if(controller.signal.aborted){model.dispose();return;}
      scene.current=model;
      model.select(latest.current.selected,latest.current.side,true);
      setReady(true);
    }).catch(()=>{/* The matching illustrated views support selection without WebGL. */});
    return ()=>{
      controller.abort();element.removeEventListener('webglcontextlost',lost);scene.current?.dispose();scene.current=null;
    };
  },[]);
  return <div className="analysis-body-stage" aria-hidden="true" data-side={side}>
    <div className="analysis-body-projection">
      {!ready && <div className="analysis-body-poster">
        <Image src={'/images/analysis/mannequin-'+side+'.webp'} width={276} height={552} alt="" unoptimized/>
        {areas.map((area,index)=>selected.includes(area.id) && <i key={area.id} style={{
          maskImage:'url(/images/analysis/mannequin-zones-'+side+'.webp)',
          maskSize:`${atlasColumns*100}% ${atlasRows*100}%`,
          maskPosition:`${(index%atlasColumns)*100/(atlasColumns-1)}% ${Math.floor(index/atlasColumns)*100/(atlasRows-1)}%`,
        }}/>)}
      </div>}
      <canvas ref={canvas} style={{opacity:ready?1:0}}/>
    </div>
  </div>;
}

export function AnalysisBodyMap({selected,onToggle}:{selected:string[];onToggle:(id:string)=>void}) {
  const sideFor=(id:string|undefined):BodySide=>areas.find(a=>a.id===id)?.art==='back'?'back':'front';
  const [side,setSide]=useState<BodySide>(()=>sideFor(selected.at(-1)));
  function toggle(id:string) {
    if(!selected.includes(id))setSide(sideFor(id));
    onToggle(id);
  }
  return <div className="analysis-anatomy">
    <fieldset className="analysis-options analysis-areas"><legend className="analysis-sr">ناحیه‌های درگیر</legend>
      {skinAreas.map(area=><ChoiceCard key={area.id} item={area} selected={selected.includes(area.id)} onChange={()=>toggle(area.id)} group="areas" multiple/>)}
    </fieldset>
    <div className="analysis-body-view" role="group" aria-label="مدل بدن و ناحیه‌های انتخاب‌شده">
      <Figure selected={selected} side={side}/>
      <div className="analysis-view-switch" role="group" aria-label="زاویهٔ نمایش بدن">
        <button type="button" aria-pressed={side==='front'} onClick={()=>setSide('front')}>نمای جلو</button>
        <button type="button" aria-pressed={side==='back'} onClick={()=>setSide('back')}>نمای پشت</button>
      </div>
    </div>
  </div>;
}
