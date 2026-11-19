import { analysisFamilies, rankAnalysisProducts } from '../../backend/src/analysis-matching';
import { api, ApiError } from './api';
import { guides, type AnalysisAnswers } from './analysis-guide';
import type { Product, ProductVariant } from './catalog';
import previewProducts from './analysis-preview-products.json';

export type Sample = {
  product:Product; variant:Pick<ProductVariant,'id'|'priceToman'>;
  family:string; profile:string; concerns:string[]; preview:boolean;
};

export function previewSamples(answers:AnalysisAnswers):Sample[] {
  return rankAnalysisProducts(answers,guides[answers.topic],previewProducts).map(item=>({...item,preview:true}));
}

export async function loadSamples({topic,profile,goals,packageId,scalpConditions}:AnalysisAnswers, signal:AbortSignal):Promise<Sample[]> {
  const answers={topic,profile,goals,packageId,scalpConditions};
  try {
    const {items}=await api<{items:Omit<Sample,'preview'>[]}>('/analyses/recommendations',{
      method:'POST', body:JSON.stringify(answers), signal,
    });
    return items.map(item=>({...item,preview:false}));
  } catch(error) {
    if(!(error instanceof ApiError) || error.status!==404)throw error;
  }

  // Older running APIs still expose full product details for the curated preview set.
  const catalogNames=analysisFamilies[topic].map(family=>family.catalog);
  const examples=previewProducts.filter(item=>item.categories.some(name=>catalogNames.includes(name)));
  const {categories}=await api<{categories:{id:string;name:string}[]}>('/catalog',{signal});
  const names=new Map(categories.map(category=>[category.id,category.name]));
  const current=await Promise.all(examples.map(async ({product})=>{
    try {
      const live=await api<Product>('/products/'+encodeURIComponent(product.slug),{signal});
      return [{product:live,categories:(live.collections??[live.category]).flatMap(id=>names.get(id)??[])}];
    } catch(error) {
      if(error instanceof ApiError && error.status===404)return [];
      throw error;
    }
  }));
  return rankAnalysisProducts(answers,guides[topic],current.flat()).map(item=>({...item,preview:false}));
}
