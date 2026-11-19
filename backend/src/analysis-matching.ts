type Family = { label: string; catalog: string; categories: string[]; identity: RegExp };
export const analysisFamilies: Record<'hair' | 'skin', Family[]> = {
  hair: [
    { label: 'شامپو', catalog: 'شامپو های درمانی', categories: ['شامپو های درمانی'], identity: /شامپو|shampoo/i },
    { label: 'ماسک مو', catalog: 'ماسک مو', categories: ['ماسک مو'], identity: /ماسک مو|hair mask/i },
    { label: 'شانه', catalog: 'مراقبت مو', categories: [], identity: /شانه|برس مو|براش مو|hairbrush|comb/i },
  ],
  skin: [
    { label: 'پاک‌کننده', catalog: 'محصولات خانگی', categories: ['شوینده صورت و پاک کننده ها','پاک کننده ها','فوم شستشو','شوینده دو فاز'], identity: /شوینده|پاک کننده|فوم شستشو|cleanser/i },
    { label: 'ضد آفتاب', catalog: 'محصولات خانگی', categories: ['ضد آفتاب'], identity: /ضد ?آفتاب|sunscreen/i },
    { label: 'مرطوب‌کننده', catalog: 'محصولات خانگی', categories: ['آبرسان'], identity: /مرطوب کننده|آبرسان|moisturi[sz]er/i },
  ],
};

export type MatchAnswers = { topic:'skin'|'hair'; profile:string; goals:string[]; packageId:string; scalpConditions?:string[] };
type Guide = { profiles:{id:string;label:string}[]; groups:{goals:{id:string;label:string}[]}[] };
type Variant = {id:string;priceToman:number;stock?:number|null;image?:string};
type CatalogProduct = {
  id:string; name:string; description:string; shortDescription?:string; highlights:string[];
  image:string; imageAlt?:string; images?:{url:string;alt:string;description:string}[];
  status?:string; stock?:number|null; variants:Variant[];
};

const profiles: Record<string,RegExp> = {
  dry:/پوست(?: های|ی)? خشک|خشکی پوست|dry skin/i, oily:/پوست(?: های|ی)? چرب|oily skin/i, combination:/مختلط|combination skin/i,
  normal:/نرمال|معمولی|normal skin/i, sensitive:/حساس|sensitive skin/i,
  straight:/مو(?:ی|های)? صاف|straight hair/i, wavy:/موج دار|wavy hair/i, curly:/مو(?:ی|های)? فر|curly hair/i,
};
const concerns: Record<string,RegExp> = {
  hydration:/مرطوب|آبرسان|رطوبت/, gentle:/ملایم|gentle/i, sun:/ضد ?آفتاب|sunscreen|spf\s*\d/i,
  tight:/کشیدگی پوست/, flaky:/پوسته ریزی|پوسته پوسته/, 'body-dry':/خشکی (?:پوست )?بدن|بدن خشک/,
  texture:/بافت پوست/, pores:/منافذ/, shine:/چربی پوست|پوست چرب/, 'dark-spots':/تیرگی|ضد ?لک/,
  tone:/یکنواخت.*رنگ پوست/, lines:/خطوط ریز|چین و چروک/, firmness:/قوام پوست|سفت کننده/,
  melasma:/ملاسما|melasma/i, rosacea:/رزاس[له]|روزاسه|rosacea/i,
  rejuvenation:/جوان ?سازی|rejuvenat/i, 'facial-wrinkles':/چین و چروک|ضد ?چروک|wrinkles?/i,
  cellulite:/سلولیت|cellulite/i, 'double-chin':/غبغب|double chin/i,
  'skin-dullness':/کدری پوست|خستگی پوست|پوست کدر|پوست خسته|کدری و خستگی|(?:dull|tired) skin/i,
  'under-eye':/تیرگی (?:دور|زیر) چشم/, acne:/ضد ?جوش|آکنه/, comedones:/سر ?سیاه|سر ?سفید/,
  marks:/جای جوش/, redness:/قرمزی|التهاب/, itch:/خارش/, bumps:/زبری/, ingrown:/موی زیر ?پوستی/,
  thinning:/کم پشتی|کم پشت|تراکم مو/, shedding:/ریزش مو/, 'oily-roots':/پوست سر چرب|چربی (?:مو|پوست سر)/,
  flakes:/شوره/, 'dry-scalp':/خشکی پوست سر|پوست سر خشک/, scalp:/شامپو|شستشوی پوست سر/,
  'dry-ends':/مو(?:ی|های) خشک|خشکی مو/, frizz:/وز مو|ضد ?وز|وز شدن|وزی مو/,
  tangles:/گره مو|گره خورد|گره باز|باز کردن گره/, 'split-ends':/موخوره/, breakage:/شکنندگی مو|موی شکننده/,
  'colour-damage':/رنگ شده|دکلره/, dullness:/کدری مو|موی کدر|درخشندگی مو/,
};

function normalize(value:string) {
  return value.replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|zwnj);/gi,' ').replace(/[\u064B-\u065F]/g,'')
    .replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\s‌-]+/g,' ').trim();
}

// Use catalog image captions and descriptive filenames until a vision model is connected.
function imageName(url:string) {
  const basename=url.split(/[?#]/,1)[0].split('/').pop() ?? '';
  try { return decodeURIComponent(basename).replace(/\.[a-z\d]+$/i,'').replace(/_/g,' '); }
  catch { return ''; }
}

export function rankAnalysisProducts<P extends CatalogProduct>(
  answers:MatchAnswers, guide:Guide, entries:{product:P;categories:string[]}[],
) {
  const families=analysisFamilies[answers.topic];
  const profile=guide.profiles.find(choice=>choice.id===answers.profile);
  const preferences=new Set([...answers.goals,...(answers.topic==='hair'?answers.scalpConditions??[]:[])]);
  const goals=guide.groups.flatMap(group=>group.goals).filter(goal=>preferences.has(goal.id));
  const candidates=entries.flatMap(({product,categories})=>{
    if(product.status!=='active' || product.stock===0)return [];
    const variant=product.variants.filter(v=>v.stock!==0 && v.priceToman>0).sort((a,b)=>a.priceToman-b.priceToman)[0];
    if(!variant)return [];
    const name=normalize(product.name);
    const description=normalize([product.shortDescription,product.description,...product.highlights].join(' '));
    const pictures=normalize([product.imageAlt,imageName(product.image),...product.variants.map(v=>imageName(v.image??'')),
      ...(product.images??[]).map(image=>[image.alt,image.description,imageName(image.url)].join(' '))].join(' '));
    const text=[name,description,pictures].join(' ');
    // Prefer explicit product identity and taxonomy over incidental mentions in the copy.
    const eligible=families.filter(f=>categories.includes(f.catalog));
    const declaredType=description.match(/نوع محصول\s*[:：]\s*([^.:؛،|]{1,65})/)?.[1] ?? '';
    const family=eligible.find(f=>f.categories.some(c=>categories.includes(c))) ?? eligible.find(f=>f.identity.test(name))
      ?? eligible.find(f=>f.identity.test(declaredType)) ?? eligible.find(f=>f.identity.test(pictures));
    if(!family)return [];
    const matched=goals.filter(goal=>{
      // Aftercare instructions often mention applying a separate sunscreen.
      if(goal.id==='sun')return family.label==='ضد آفتاب' || /spf\s*[1-9۱-۹]/i.test(name+' '+pictures);
      return concerns[goal.id]?.test(text);
    }).map(goal=>goal.label);
    const profileLabel=profiles[answers.profile]?.test(text) ? profile?.label ?? '' : '';
    return [{product,variant,family:family.label,profile:profileLabel,concerns:matched}];
  });
  const score=(item:typeof candidates[number])=>item.concerns.length*2+Number(Boolean(item.profile));
  candidates.sort((a,b)=>score(b)-score(a) || (answers.packageId==='economy' ? a.variant.priceToman-b.variant.priceToman : 0)
    || a.product.id.localeCompare(b.product.id));
  const seen=new Set<string>();
  return candidates.filter(item=>{
    if(seen.has(item.family))return false;
    seen.add(item.family);return true;
  }).slice(0,answers.packageId==='advanced'?3:2);
}
