import test from 'node:test';
import assert from 'node:assert/strict';
import {rankAnalysisProducts} from '../dist/analysis-matching.js';

test('matches full descriptions and gallery evidence, then compares purchasable variant prices',()=>{
  const answers={topic:'hair',profile:'curly',goals:['frizz'],packageId:'economy'};
  const guide={profiles:[{id:'curly',label:'فر'}],groups:[{goals:[{id:'frizz',label:'وز مو'}]}]};
  const entry=(id,price,extra={})=>({
    categories:['ماسک مو'],
    product:{id,name:'نسخهٔ شماره دو',description:'<p>مناسب موهای فر</p>',shortDescription:'',highlights:[],
      image:'cover.webp',images:[{url:'gallery.webp',alt:'',description:'ماسک ضد وز'}],stock:null,status:'active',
      variants:[{id:'empty',priceToman:1,stock:0},{id,priceToman:price,stock:2}],...extra},
  });
  const [sample]=rankAnalysisProducts(answers,guide,[
    entry('cheap-no-evidence',1,{images:[]}),entry('sold-out',1,{stock:0}),
    entry('higher',80),entry('lower',40),
  ]);
  assert.equal(sample.product.id,'lower');
  assert.equal(sample.variant.id,'lower');
  assert.equal(sample.profile,'فر');
  assert.deepEqual(sample.concerns,['وز مو']);
});

test('mentioning sunscreen in aftercare does not classify a professional vial as sunscreen',()=>{
  const rows=[{categories:['محصولات خانگی'],product:{
    id:'vial',name:'ویال ضد آکنه',description:'بعد از مصرف، از ضد آفتاب استفاده کنید.',highlights:[],
    image:'vial.webp',status:'active',variants:[{id:'v',priceToman:400}],
  }}];
  assert.deepEqual(rankAnalysisProducts({topic:'skin',profile:'dry',goals:['sun'],packageId:'advanced'},
    {profiles:[],groups:[]},rows),[]);
});

test('a scalp concern can match independently of the hair goals and counts only once',()=>{
  const guide={profiles:[],groups:[{goals:[{id:'flakes',label:'شوره و پوسته‌ریزی'}]}]};
  const entries=[{categories:['شامپو های درمانی'],product:{id:'shampoo',name:'شامپو ضد شوره',description:'',
    highlights:[],image:'shampoo.webp',status:'active',variants:[{id:'v',priceToman:1000}]}}];
  for(const goals of [[],['flakes']]){
    const [item]=rankAnalysisProducts({topic:'hair',profile:'wavy',goals,scalpConditions:['flakes'],packageId:'economy'},guide,entries);
    assert.deepEqual(item.concerns,['شوره و پوسته‌ریزی']);
  }
});
