'use client';

import Image from 'next/image';
import {useEffect,useId,useLayoutEffect,useRef,useState,type CSSProperties,type PointerEvent} from 'react';
import {Icon} from './icons';

export type OrbitBrand={id:string;name:string;label:string;image:string};
type OrbitControls={step:(direction:number)=>void;center:(name:string)=>void;first:()=>void;last:()=>void;choose:()=>string;down:(event:PointerEvent<HTMLDivElement>)=>void;move:(event:PointerEvent<HTMLDivElement>)=>void;end:(event:{pointerId:number;type:string})=>void;wasDragged:()=>boolean};
const wrap=(value:number,count:number)=>((value%count)+count)%count;
const distance=(value:number,count:number)=>wrap(value+count/2,count)-count/2;

// Like the homepage display, each logo follows an ellipse, recedes and dissolves at the rear.
// A bounded visible arc keeps a large brand catalog from crowding the foreground.
function pose(index:number,phase:number,count:number,width:number){
  const step=width<650?60:width<1000?40:30;
  const offset=distance(index-phase,count),degrees=offset*step;
  const radians=degrees*Math.PI/180,depth=Math.cos(radians);
  const boundary=Math.max(0,Math.min(1,(depth-.06)/.72));
  const opacity=Math.abs(degrees)>=90?0:boundary**3*(boundary*(boundary*6-15)+10);
  return {x:-Math.sin(radians)*width*(width<650?.44:.39),y:(depth-1)*48,scale:.72+.28*Math.max(0,depth),tilt:Math.sin(radians)*22,opacity,visible:opacity>.005,order:Math.round(100+depth*50)};
}
function styleFor(index:number,phase:number,count:number):CSSProperties{
  const value=pose(index,phase,count,1000);
  return {'--brand-x':`${value.x}px`,'--brand-y':`${value.y}px`,'--brand-scale':value.scale,'--brand-tilt':`${value.tilt}deg`,opacity:value.opacity,visibility:value.visible?'visible':'hidden',zIndex:value.order} as CSSProperties;
}
function BrandLogo({image,name}:{image:string;name:string}){
  const [failed,setFailed]=useState(false);
  const logoClass=[/\/brand-(biohyalux|genosys|fusion)\.png$/.test(image)||name==='اوتینووکس'?'brand-logo-wide':'',name==='Dr Geno'?'brand-logo-vertical':''].filter(Boolean).join(' ');
  return image&&!failed?<Image className={logoClass||undefined} src={image} alt="" fill sizes="180px" draggable={false} onError={()=>setFailed(true)}/>:<bdi className="brand-carousel-wordmark">{name}</bdi>;
}

export function BrandOrbit({items,selected,onSelect}:{items:OrbitBrand[];selected:string;onSelect:(name:string)=>void}){
  const stageRef=useRef<HTMLDivElement>(null),positions=useRef<(HTMLAnchorElement|null)[]>([]),controls=useRef<OrbitControls|null>(null);
  const [initialIndex]=useState(()=>{const index=items.findIndex(item=>item.name===selected);return index>=0?index:Math.min(2,items.length-1);});
  const [front,setFront]=useState(initialIndex);
  const hintId=useId();

  useLayoutEffect(()=>{
    const stage=stageRef.current;if(!stage)return;
    const count=items.length,preference=window.matchMedia('(prefers-reduced-motion: reduce)');
    let phase=initialIndex,width=stage.clientWidth,frame:number|null=null,frontIndex=initialIndex;
    let tween:{from:number;to:number;start:number}|null=null;
    let suppressClickUntil=0;
    let pointer:{id:number;x:number;y:number;lastX:number;dragging:boolean}|null=null;
    const cancelFrame=()=>{if(frame!==null)cancelAnimationFrame(frame);frame=null;tween=null;};
    function paint(){
      const nearest=wrap(Math.round(phase),count);
      if(nearest!==frontIndex){frontIndex=nearest;setFront(nearest);}
      items.forEach((_,index)=>{
        const node=positions.current[index];if(!node)return;
        const value=pose(index,phase,count,width);
        node.style.setProperty('--brand-x',`${value.x.toFixed(3)}px`);
        node.style.setProperty('--brand-y',`${value.y.toFixed(3)}px`);
        node.style.setProperty('--brand-scale',value.scale.toFixed(4));
        node.style.setProperty('--brand-tilt',`${value.tilt.toFixed(2)}deg`);
        node.style.opacity=value.opacity.toFixed(4);
        node.style.visibility=value.visible?'visible':'hidden';
        node.style.zIndex=String(value.order);
        node.style.pointerEvents=value.opacity>.18?'auto':'none';
      });
    }
    function tick(now:number){
      frame=null;if(!tween)return;
      const progress=Math.min(1,(now-tween.start)/420);
      const eased=progress<.5?4*progress**3:1-(-2*progress+2)**3/2;
      phase=tween.from+(tween.to-tween.from)*eased;paint();
      if(progress<1)frame=requestAnimationFrame(tick);
      else{phase=wrap(tween.to,count);tween=null;}
    }
    function moveTo(target:number){
      cancelFrame();
      if(preference.matches||Math.abs(target-phase)<.001){phase=wrap(target,count);paint();return;}
      tween={from:phase,to:target,start:performance.now()};frame=requestAnimationFrame(tick);
    }
    function centerIndex(index:number){moveTo(phase+distance(index-phase,count));}
    function end(event:{pointerId:number;type:string}){
      const current=pointer;if(!current||event.pointerId!==current.id)return;
      pointer=null;delete stage!.dataset.dragging;
      if(stage!.hasPointerCapture(current.id))stage!.releasePointerCapture(current.id);
      if(current.dragging){suppressClickUntil=performance.now()+450;if(event.type==='pointerup')moveTo(Math.round(phase));}
    }
    controls.current={
      step(direction){moveTo(Math.round(tween?.to??phase)+direction);},
      first(){centerIndex(0);},last(){centerIndex(count-1);},
      center(name){const index=items.findIndex(item=>item.name===name);if(index>=0)centerIndex(index);},
      choose(){return items[frontIndex].name;},
      down(event){
        if(count<2||!event.isPrimary||event.button!==0)return;
        cancelFrame();suppressClickUntil=0;
        pointer={id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,dragging:false};
      },
      move(event){
        if(!pointer||event.pointerId!==pointer.id)return;
        const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
        if(!pointer.dragging){
          if(Math.abs(dy)>7&&Math.abs(dy)>Math.abs(dx)*1.15){pointer=null;return;}
          if(Math.abs(dx)<7||Math.abs(dx)<Math.abs(dy)*1.1)return;
          pointer.dragging=true;stage.dataset.dragging='true';stage.setPointerCapture(event.pointerId);
          if(document.activeElement instanceof HTMLElement&&stage.contains(document.activeElement))document.activeElement.blur();
        }
        if(event.cancelable)event.preventDefault();
        const step=width<650?60:width<1000?40:30;
        const spacing=Math.max(90,Math.sin(step*Math.PI/180)*width*(width<650?.44:.39));
        phase+=(event.clientX-pointer.lastX)/spacing;pointer.lastX=event.clientX;paint();
      },end,
      wasDragged(){return performance.now()<suppressClickUntil;},
    };
    const resize=new ResizeObserver(()=>{width=stage.clientWidth;paint();});resize.observe(stage);paint();
    const onBlur=()=>{if(pointer)end({pointerId:pointer.id,type:'pointercancel'});cancelFrame();};
    const onPreference=()=>{if(preference.matches&&tween){phase=wrap(tween.to,count);cancelFrame();paint();}};
    window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);window.addEventListener('blur',onBlur);
    preference.addEventListener('change',onPreference);
    return()=>{cancelFrame();resize.disconnect();window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);window.removeEventListener('blur',onBlur);preference.removeEventListener('change',onPreference);if(pointer&&stage.hasPointerCapture(pointer.id))stage.releasePointerCapture(pointer.id);controls.current=null;};
  },[items,initialIndex]);

  useEffect(()=>{controls.current?.center(selected);},[selected,items]);

  return <div className="brand-orbit">
    <div ref={stageRef} id="brands-carousel" className="brand-orbit-stage" role="group" aria-roledescription="نمایش چرخان" aria-label="انتخاب برند" aria-describedby={hintId} tabIndex={0}
      onPointerDown={event=>controls.current?.down(event)} onPointerMove={event=>controls.current?.move(event)} onPointerUp={event=>controls.current?.end(event)} onPointerCancel={event=>controls.current?.end(event)} onLostPointerCapture={event=>{
        // Touch capture transfers from the tapped logo to the stage when dragging starts.
        if(event.target===event.currentTarget)controls.current?.end(event);
      }}
      onDragStart={event=>event.preventDefault()}
      onClickCapture={event=>{if(event.detail!==0&&controls.current?.wasDragged()){event.preventDefault();event.stopPropagation();}}}
      onKeyDown={event=>{
        if(event.altKey||event.ctrlKey||event.metaKey)return;
        if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();controls.current?.step(event.key==='ArrowLeft'?1:-1);}
        else if(event.key==='Home'||event.key==='End'){event.preventDefault();if(event.key==='Home')controls.current?.first();else controls.current?.last();}
        else if((event.key==='Enter'||event.key===' ')&&event.target===event.currentTarget){event.preventDefault();onSelect(controls.current?.choose()??'');}
      }}>
      {items.map((item,index)=><a key={item.id} ref={node=>{positions.current[index]=node;}} draggable={false} href={item.name ? '/brands?brand=' + encodeURIComponent(item.name) : '/brands'} className={`brand-carousel-item brand-orbit-card${!item.name?' brand-carousel-all':''}${selected===item.name?' is-selected':''}`} style={styleFor(index,initialIndex,items.length)} tabIndex={index===front?0:-1} aria-label={item.name?`محصولات ${item.name}`:item.label} aria-current={selected===item.name?'page':undefined} onClick={event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();controls.current?.center(item.name);onSelect(item.name);}}>
        <span className="brand-carousel-art">{item.name?<BrandLogo key={item.image} image={item.image} name={item.name}/>:<Icon name="grid" size={35}/>}</span><bdi className="brand-carousel-name">{item.label}</bdi><span className="brand-carousel-check" aria-hidden="true"><Icon name="check" size={13}/></span>
      </a>)}
    </div>
    <div className="brand-orbit-tools"><p id={hintId}>برای چرخاندن، برندها رو بکش یا از کلیدهای پیکان استفاده کن.</p><div className="brand-carousel-controls"><button type="button" aria-label="برندهای قبلی" aria-controls="brands-carousel" disabled={items.length<2} onClick={()=>controls.current?.step(-1)}><Icon name="arrow-right" size={20}/></button><button type="button" aria-label="برندهای بعدی" aria-controls="brands-carousel" disabled={items.length<2} onClick={()=>controls.current?.step(1)}><Icon name="arrow-left" size={20}/></button></div></div>
  </div>;
}
