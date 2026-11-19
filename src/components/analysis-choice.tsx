import Image from 'next/image';
import { artUrl, type Choice } from '@/lib/analysis-guide';
import { Icon } from './icons';

export function AnalysisArtwork({item, fallback, size=160}: {item:Choice; fallback:string; size?:number}) {
  const art = item.art ?? fallback;
  if (art === 'front' || art === 'back') return <span className="analysis-figure" aria-hidden="true">
    <Image src={artUrl(art)} alt="" width={70} height={140} unoptimized/>
    {item.x !== undefined && item.y !== undefined && <i style={{left:item.x+'%',top:item.y+'%'}}/>}
  </span>;
  return <Image src={artUrl(art)} alt="" width={size} height={size} sizes={size+'px'} unoptimized/>;
}

export function ChoiceCard({item, selected, onChange, group, multiple=false, large=false, art='skin'}:{
  item:Choice; selected:boolean; onChange:()=>void; group:string; multiple?:boolean; large?:boolean; art?:string;
}) {
  return <label className={large?'analysis-topic':'analysis-option'}>
    <input name={group} value={item.id} type={multiple?'checkbox':'radio'} checked={selected} onChange={onChange}/>
    <span className={large?'analysis-topic-face':'analysis-option-face'}>
      {large && <span aria-hidden="true" className="analysis-art"><AnalysisArtwork item={item} fallback={art}/></span>}
      <span className={large?'analysis-topic-copy':'analysis-choice-label'}>{large?<><strong>{item.cardTitle ?? item.label}</strong>{item.caption && <small>{item.caption}</small>}</>:item.label}</span>
      <span className="analysis-check" aria-hidden="true"><Icon name="check" size={15}/></span>
    </span>
  </label>;
}
