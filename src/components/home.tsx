'use client';
import {useSiteSettings} from './site-settings-provider';
import { useState } from 'react';
import Link from 'next/link';
import { useCatalog } from './catalog-provider';
import { useProductSearch } from './use-product-search';
import { type CategoryId } from '@/lib/catalog';
import { ProductCard } from './product-card';
import { Icon } from './icons';
import { HomeBanner } from './home-banner';
import { SkinQuizBanner } from './skin-quiz-banner';
import { TreatmentStory } from './treatment-story';




import type { ProductResults } from '@/lib/server-catalog';

function HomeCollectionProducts({ category, initial }: { category: CategoryId; initial?: ProductResults }) {
  const {settings:{home:{productLimit:HOME_PRODUCT_LIMIT}}}=useSiteSettings();
  const { products, loading, error } = useProductSearch({ category, limit: String(HOME_PRODUCT_LIMIT) }, initial);
  return <div id="home-collection-products" aria-busy={loading}>
    {!products.length ? <div className="empty-state" role="status">
      <h3>{loading ? 'در حال دریافت محصولات…' : error || 'محصولات تازه به‌زودی اینجا منتظرت هستند.'}</h3>
      {error ? <button className="button secondary" onClick={() => window.location.reload()}>تلاش دوباره</button> : null}
    </div> : <div className="product-grid home-product-grid">
      {products.slice(0, HOME_PRODUCT_LIMIT).map((product, index) => <ProductCard key={product.id} product={product} index={index}/>)}
    </div>}
  </div>;
}

export function Home({ initial }: { initial?: ProductResults }) {
  const {settings:{home:config}}=useSiteSettings();
  const { categoryOptions } = useCatalog();
  const [category, setCategory] = useState<CategoryId>('all');
  // The all-products tab is included in the eight-tab homepage limit.
  const homeCategories = categoryOptions.slice(0, config.categoryLimit);
  const categoryLabel = homeCategories.find(option => option.id === category)?.label ?? 'همهٔ محصولات';
  const collectionHref = category === 'all' ? '/shop' : `/shop?category=${encodeURIComponent(category)}`;

  return <main id="main-content">
    <HomeBanner/>
    <div className="home-continuation">
      {config.showCollection?<section className="collection-section container" aria-labelledby="collection-title">
        <div className="section-heading"><h2 id="collection-title">{config.collectionTitle}</h2></div>
        <div className="category-tabs home-collection-tabs" role="group" aria-label="دسته‌بندی محصولات">
          {homeCategories.map(option => <button key={option.id} onClick={() => setCategory(option.id)} aria-pressed={category === option.id} aria-controls="home-collection-products" className={category === option.id ? 'selected' : ''}>{option.label}</button>)}
        </div>
        <HomeCollectionProducts key={category} category={category} initial={category === 'all' ? initial : undefined}/>
        <div className="collection-more">
          <Link href={collectionHref} className="collection-more-link" aria-label={`مشاهده همه · ${categoryLabel}`}>
            <span>{config.moreLabel}</span><span className="collection-more-arrow" aria-hidden="true"><Icon name="arrow-left" size={20}/></span>
          </Link>
        </div>
      </section>:null}
      {config.showQuiz?<SkinQuizBanner/>:null}
    </div>
    {config.showStory?<TreatmentStory/>:null}
  </main>;
}
