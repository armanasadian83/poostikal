'use client';
import {useSiteSettings} from './site-settings-provider';
import Image from 'next/image';
import Link from 'next/link';
import { catalogCategoryHref } from '@/lib/catalog';
import { useCatalog } from './catalog-provider';
import { Icon } from './icons';
import { BannerProductOrbit } from './banner-product-orbit';

// Curated banner artwork is independent of the editable catalog.


export function HomeBanner() {
  const { categoryOptions } = useCatalog();
  const {settings:{home:config}}=useSiteSettings();
  const bannerBrands=config.brands;
  const categoryHref=(href:string)=>{const id=href.match(/^\/shop\?category=(home-care|salon|equipment)$/)?.[1];return id?catalogCategoryHref(categoryOptions,id as 'home-care'|'salon'|'equipment'):href;};
  return <div className="home-banner-region">
    {config.showHero?<section className="full-banner-hero" aria-labelledby="hero-title">
      <div className="container banner-content">
        <div className="banner-copy"><h1 id="hero-title" style={{whiteSpace:"pre-line"}}>{config.heroTitle}</h1><p style={{whiteSpace:"pre-line"}}>{config.heroDescription}</p><div className="banner-actions"><Link href={categoryHref(config.primaryHref)} className="button banner-primary">{config.primaryLabel}<Icon name="arrow-left" size={20}/></Link><Link href={categoryHref(config.secondaryHref)} className="button banner-secondary">{config.secondaryLabel}</Link></div></div>
        {config.showOrbit?<BannerProductOrbit/>:null}
      </div>
    </section>:null}
    {config.showBrands && bannerBrands.length ? <section className="banner-brand-section container" aria-label="برندهای محصولات پوستیکال"><div className="banner-brand-rail" dir="ltr">{bannerBrands.map(brand => <Link className="banner-brand-item" data-brand={brand.id} key={brand.id} href={brand.href} aria-label={`محصولات ${brand.name}`}><span className="real-brand-mark"><Image src={brand.image} alt={brand.name} fill sizes="(max-width: 650px) 110px, 170px"/></span></Link>)}</div></section> : null}
  </div>;
}
