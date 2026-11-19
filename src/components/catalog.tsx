'use client';
import {useSiteSettings} from './site-settings-provider';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { catalogUrl, type CatalogSelection, type CatalogMode } from '@/lib/catalog-url';
import type { ProductResults } from '@/lib/server-catalog';
import { formatNumber } from '@/lib/format';
import { useCatalog } from './catalog-provider';
import { useProductSearch } from './use-product-search';
import { AskPoostikalLink } from './chat-transition';
import { Dialog } from './dialog';
import { Icon } from './icons';
import { ProductCard } from './product-card';
import { BrandCarousel } from './brand-carousel';


const normalizeSearch = (value: string) => value.trim().toLocaleLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ');

type FilterProps = {
  category: string;
  brand: string;
  href: (changes: Partial<CatalogSelection>) => string;
  hideBrands?: boolean;
};

function ShopFilters({ category, brand, href, hideBrands }: FilterProps) {
  const { categories: terms, categoryOptions, brands, loading, error } = useCatalog();
  const [categoryQuery, setCategoryQuery] = useState('');
  const [brandQuery, setBrandQuery] = useState('');
  const categories = categoryOptions.filter(option => option.id === 'all' || normalizeSearch(option.label).includes(normalizeSearch(categoryQuery)));
  const visibleBrands = brands.filter(option => normalizeSearch(`${option.name} ${option.persianName}`).includes(normalizeSearch(brandQuery)));

  const categorySlugs = new Map(terms.map(term => [term.id, term.slug]));
  return <div className="shop-filter-groups">
    <details className="shop-filter-group" open>
      <summary>دسته‌بندی محصولات<Icon name="chevron-down" size={17}/></summary>
      <label className="shop-filter-search">
        <Icon name="search" size={17}/>
        <input type="search" placeholder="جستجو در دسته‌بندی‌ها…" aria-label="جستجو در دسته‌بندی‌ها" value={categoryQuery} onChange={event => setCategoryQuery(event.target.value)}/>
      </label>
      <div className="shop-filter-options" role="group" aria-label="دسته‌بندی محصولات">
        {categories.map(option => <Link key={option.id} prefetch={false} scroll={false} href={href({ category: categorySlugs.get(option.id) || 'all' })}
          aria-current={category === option.id ? 'page' : undefined} className={`shop-filter-choice${category === option.id ? ' is-selected' : ''}`}>
          <span className="shop-filter-dot" aria-hidden="true"/><span>{option.label}</span>
        </Link>)}
        {categoryQuery && categories.length === 1 ? <p className="shop-filter-empty">دسته‌بندی‌ای پیدا نشد.</p> : null}
      </div>
    </details>
    {!hideBrands ? <details className="shop-filter-group" open>
      <summary>برندها<Icon name="chevron-down" size={17}/></summary>
      <label className="shop-filter-search">
        <Icon name="search" size={17}/>
        <input type="search" placeholder="جستجو در برندها…" aria-label="جستجو در برندها" value={brandQuery} onChange={event => setBrandQuery(event.target.value)}/>
      </label>
      <div className="shop-filter-options shop-brand-options" role="group" aria-label="برند محصولات">
        <Link prefetch={false} scroll={false} href={href({ brand: '' })} aria-current={!brand ? 'page' : undefined} className={`shop-filter-choice${!brand ? ' is-selected' : ''}`}>
          <span className="shop-filter-dot" aria-hidden="true"/><span>همهٔ برندها</span>
        </Link>
        {visibleBrands.map(option => <Link key={option.id} prefetch={false} scroll={false} href={href({ brand: option.name })}
          aria-current={brand === option.name ? 'page' : undefined} className={`shop-filter-choice${brand === option.name ? ' is-selected' : ''}`}>
          <span className="shop-filter-dot" aria-hidden="true"/><bdi>{option.name}</bdi>
        </Link>)}
        {brandQuery && !visibleBrands.length ? <p className="shop-filter-empty">برندی پیدا نشد.</p> : null}
      </div>
    </details> : null}
    {loading || error ? <p className="shop-filter-empty" role="status">{error ? 'فیلترها دریافت نشدند. صفحه را تازه کن.' : 'در حال دریافت فیلترها…'}</p> : null}
  </div>;
}

function pageNumbers(page: number, count: number) {
  const pages: (number | string)[] = [];
  for (let number = 1; number <= count; number++) {
    if (number === 1 || number === count || Math.abs(number - page) <= 1) pages.push(number);
    else if (typeof pages.at(-1) === 'number') pages.push(`gap-${number}`);
  }
  return pages;
}

export function Catalog({ mode, selection, initial }: { mode: CatalogMode; selection: CatalogSelection; initial: ProductResults }) {
  const { settings: { shop: config } } = useSiteSettings();
  const router = useRouter();
  const isBrands = mode === 'brands';
  const { categories } = useCatalog();
  const [query, setQuery] = useState(selection.q);
  const { category, brand, sort } = selection;
  const page = query === selection.q ? selection.page : 1;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { products, total, loading, error, retry } = useProductSearch({ q: query, category, brand, sort, page: String(page), limit: String(config.pageSize) }, initial);
  const filterCount = Number(category !== 'all') + Number(!!brand) + Number(!!query);
  const categoryTerm = categories.find(option => option.id === category || option.slug === category);
  const categoryLabel = categoryTerm?.name ?? 'دسته‌بندی انتخاب‌شده';
  const totalPages = Math.ceil(total / config.pageSize);

  function href(changes: Partial<CatalogSelection>) {
    return catalogUrl(mode, { ...selection, q: query, page: 1, ...changes });
  }
  function apply(changes: Partial<CatalogSelection>) { router.push(href(changes), { scroll: false }); }
  function setCategory(value: string) { apply({ category: categories.find(term => term.id === value)?.slug ?? value }); }
  function setBrand(value: string) { apply({ brand: value }); }
  function clear() {
    setQuery('');
    router.push('/' + mode, { scroll: false });
  }
  const filterProps = { category: categoryTerm?.id ?? category, brand, href, hideBrands: isBrands };

  return <section className="shop-catalog container">
    <div className="shop-intro">
      <div>
        <nav className="shop-breadcrumb" aria-label="مسیر صفحه"><Link href="/">خانه</Link><span aria-hidden="true">/</span><span aria-current="page">{isBrands ? 'برندها' : 'فروشگاه'}</span></nav>
        <h1>{categoryTerm?.name || (brand ? 'محصولات ' + brand : isBrands ? 'دنیای برندهای پوستیکال' : config.title)}</h1>
        <p>{isBrands ? 'از برند محبوبت شروع کن؛ محصولاتش رو ببین و انتخابت رو پیدا کن.' : config.description}</p>
      </div>
      <AskPoostikalLink className="shop-ask-link"><Icon name="lips" size={27}/><span>از پوستیکال بپرس</span><Icon name="arrow-left" size={18}/></AskPoostikalLink>
    </div>

    {isBrands ? <BrandCarousel selected={brand} onSelect={setBrand}/> : null}

    <div className="shop-layout">
      <aside className="shop-filter-panel" aria-label="فیلتر محصولات">
        <div className="shop-filter-heading"><h2>انتخاب دقیق‌تر</h2><Icon name="sliders" size={19}/></div>
        <ShopFilters {...filterProps}/>
        {filterCount ? <button className="shop-reset" onClick={clear}><Icon name="refresh" size={16}/>پاک کردن فیلترها</button> : null}
      </aside>

      <div id="shop-results" className="shop-results">
        {isBrands ? <h2 className="brands-selected-title">{brand ? <>محصولات <bdi>{brand}</bdi></> : 'همهٔ محصولات'}</h2> : null}
        <div className="shop-toolbar">
          <p className="shop-result-count" role="status" aria-live="polite">{loading ? 'در حال جستجو…' : error ? 'دریافت ناموفق' : <><strong>{formatNumber(total)}</strong> محصول</>}</p>
          <label className="shop-search">
            <Icon name="search" size={20}/>
            <input type="search" placeholder="جستجو در محصولات…" aria-label="جستجوی محصول یا برند" value={query} onChange={event => setQuery(event.target.value)}/>
          </label>
          <button className="shop-mobile-filter-button" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog" aria-expanded={filtersOpen}><Icon name="sliders" size={18}/>فیلترها{filterCount ? <span>{formatNumber(filterCount)}</span> : null}</button>
          <label className="shop-sort">
            <span className="shop-sort-label">مرتب‌سازی</span>
            <select value={sort} onChange={event => apply({ sort: event.target.value })} aria-label="مرتب‌سازی محصولات"><option value="featured">جدیدترین محصولات</option><option value="low">کمترین قیمت</option><option value="high">بیشترین قیمت</option></select>
            <Icon name="chevron-down" size={16}/>
          </label>
        </div>

        {filterCount ? <div className="shop-active-filters" aria-label="فیلترهای انتخاب‌شده">
          {category !== 'all' ? <button onClick={() => setCategory('all')} aria-label={`حذف فیلتر ${categoryLabel}`}>{categoryLabel}<Icon name="close" size={14}/></button> : null}
          {brand ? <button onClick={() => setBrand('')} aria-label={`حذف فیلتر برند ${brand}`}><bdi>{brand}</bdi><Icon name="close" size={14}/></button> : null}
          {query ? <button onClick={() => setQuery('')} aria-label="پاک کردن جستجو"><span>جستجو: {query}</span><Icon name="close" size={14}/></button> : null}
          <button className="shop-clear-all" onClick={clear}>پاک کردن همه</button>
        </div> : null}

        <div className="shop-results-content" aria-busy={loading}>
          {loading ? <div className="product-grid catalog-grid shop-skeleton-grid" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <div className="shop-card-skeleton" key={index}><div className="shop-skeleton-art"/><div className="shop-skeleton-lines"><span/><span/></div><div className="shop-skeleton-bottom"/></div>)}</div>
            : error ? <div className="shop-empty-state" role="alert"><span className="shop-empty-icon"><Icon name="refresh" size={30}/></span><h2>محصولات بارگذاری نشدند.</h2><p>دوباره امتحان کن تا انتخاب‌ها رو ببینی.</p><button className="shop-primary-button" onClick={retry}>تلاش دوباره<Icon name="refresh" size={18}/></button></div>
            : products.length ? <div className="product-grid catalog-grid">{products.map((product, index) => <ProductCard key={product.id} product={product} index={index}/>)}</div>
            : <div className="shop-empty-state"><span className="shop-empty-icon"><Icon name="search" size={32}/></span><h2>هنوز انتخابت رو پیدا نکردیم.</h2><p>یک نام کوتاه‌تر بنویس یا فیلترها رو تغییر بده.</p><button className="shop-primary-button" onClick={clear}>مشاهده همه محصولات<Icon name="arrow-left" size={18}/></button></div>}
        </div>

        {!error && totalPages > 1 ? <nav className="shop-pagination" aria-label="صفحه‌های محصولات">
          {page > 1 && <Link prefetch={false} className="shop-page-direction" href={href({page: page - 1}) + '#shop-results'} rel="prev" aria-label="صفحه قبلی"><Icon name="arrow-right" size={18}/><span>قبلی</span></Link>}
          {pageNumbers(page, totalPages).map(number => typeof number === 'number' ? <Link key={number} prefetch={false} href={href({page: number}) + '#shop-results'} aria-label={`صفحه ${formatNumber(number)}`} aria-current={page === number ? 'page' : undefined}>{formatNumber(number)}</Link> : <span className="shop-page-gap" key={number}>…</span>)}
          {page < totalPages && <Link prefetch={false} className="shop-page-direction" href={href({page: page + 1}) + '#shop-results'} rel="next" aria-label="صفحه بعدی"><span>بعدی</span><Icon name="arrow-left" size={18}/></Link>}
        </nav> : null}
      </div>
    </div>

    {filtersOpen ? <Dialog title="انتخاب دقیق‌تر" drawer drawerSide="right" onClose={() => setFiltersOpen(false)}>
      <div className="shop-mobile-filters">
        <ShopFilters {...filterProps}/>
        <div className="shop-mobile-filter-actions">
          {filterCount ? <button className="shop-reset" onClick={clear}><Icon name="refresh" size={16}/>پاک کردن فیلترها</button> : null}
          <button className="shop-primary-button" onClick={() => setFiltersOpen(false)}>مشاهده محصولات<Icon name="arrow-left" size={18}/></button>
        </div>
      </div>
    </Dialog> : null}
  </section>;
}
