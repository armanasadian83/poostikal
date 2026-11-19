import { publicMetadata, breadcrumbs } from '@/lib/seo';
import { StructuredData } from '@/components/structured-data';
import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { SocialMark, socialIdentity, type SocialPlatform } from '@/components/social-mark';
import { getServerSiteSettings } from '@/lib/server-site-settings';
import styles from './about.module.css';

export async function generateMetadata() {
  const { settings: { contact, story } } = await getServerSiteSettings();
  return publicMetadata({ path: '/about-us', title: contact.aboutTitle, images: [story.image], imageAlt: story.alt,
    description: contact.aboutDescription || 'با فروشگاه تخصصی پوستیکال و راه‌های تماس با ما آشنا شوید.' });
}

type ContactIcon = 'phone' | 'mail' | 'pin' | SocialPlatform | 'link';
const signs = {
  phone: <path d="M5.2 3.4c.7-.4 1.5-.2 1.9.5l2.1 3.5c.4.7.3 1.4-.2 2l-1.3 1.3a15.4 15.4 0 0 0 5.7 5.7l1.3-1.3c.6-.5 1.3-.6 2-.2l3.5 2.1c.7.4.9 1.2.5 1.9l-.7 1.3c-.7 1.2-2.1 1.7-3.4 1.3C9.2 19.2 4.8 14.8 2.5 7.4c-.4-1.3.1-2.7 1.3-3.4z"/>,
  mail: <><rect x="2.5" y="4.5" width="19" height="15" rx="3.5"/><path d="m3.8 6.3 7 5.5a2 2 0 0 0 2.4 0l7-5.5"/></>,
  pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.8"/></>,
  link: <><path d="m9.7 14.3 4.6-4.6m-5.7 2-2.2 2.2a3.7 3.7 0 0 0 5.2 5.2l2.2-2.2m-3.6-9.8 2.2-2.2a3.7 3.7 0 0 1 5.2 5.2l-2.2 2.2"/></>,
};

function Mark({kind}:{kind:ContactIcon}) {
  if (kind === 'telegram' || kind === 'instagram' || kind === 'whatsapp') return <SocialMark kind={kind} className={styles.mark}/>;
  return <svg className={styles.mark} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{signs[kind]}</svg>;
}

export default async function AboutPage() {
  const {settings:{contact,story}}=await getServerSiteSettings();
  const paragraphs=contact.aboutDescription.split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean);
  const channels=[
    {kind:'phone',label:'تلفن تماس',value:contact.phone,href:'tel:'+contact.phone,dir:'ltr'},
    {kind:'mail',label:'ایمیل',value:contact.email,href:'mailto:'+contact.email,dir:'ltr'},
    {kind:'pin',label:'نشانی',value:contact.address,href:null,dir:'rtl'},
  ] as const;
  const direct=channels.filter(item=>item.value.trim());
  return <main id="main-content" className={styles.page}>
    <StructuredData nodes={[breadcrumbs([{ name: 'خانه', path: '/' }, { name: contact.aboutTitle, path: '/about-us' }])]} />
    <div className={'container '+styles.content}>
      <nav className={'shop-breadcrumb '+styles.crumb} aria-label="مسیر صفحه"><Link href="/">خانه</Link><span aria-hidden="true">/</span><span aria-current="page">درباره ما</span></nav>
      <section className={styles.hero} aria-labelledby="about-heading">
        <div className={styles.intro}>
          <h1 id="about-heading">{contact.aboutTitle||'درباره پوستیکال'}</h1>
          {paragraphs.map((paragraph,index)=><p key={index}>{paragraph}</p>)}
          <Link href="/shop" className={styles.shopLink}>دیدن فروشگاه <Icon name="arrow-left" size={18}/></Link>
        </div>
        <div className={styles.photograph}><Image src={story.image} alt={story.alt} fill sizes="(max-width: 740px) 118vw, (max-width: 1400px) 80vw, 1120px" quality={95} loading="eager" /></div>
      </section>
      {(direct.length>0||contact.socialLinks.length>0)&&<section className={styles.contact} aria-labelledby="contact-heading">
        <h2 id="contact-heading">راه‌های ارتباط با پوستیکال</h2>
        <div className={styles.directory}>
          {direct.length>0&&<address className={styles.direct}>{direct.map(({kind,value,href,label,dir})=><div key={kind} className={styles.directRow}>
            <Mark kind={kind}/><div><span className={styles.channelLabel}>{label}</span>
            {href?<a className={styles.directValue} href={href}><bdi dir={dir}>{value}</bdi></a>:<span className={styles.directValue}>{value}</span>}</div>
          </div>)}</address>}
          {contact.socialLinks.length>0&&<ul className={styles.social}>{contact.socialLinks.map(({label,href},index)=>{
            const {kind,detail}=socialIdentity(href);
            return <li key={href+index}><a href={href} className={styles.socialLink}>
              <Mark kind={kind}/><span>{label}</span>{detail&&<bdi className={styles.handle} dir="ltr">{detail}</bdi>}<Icon className={styles.arrow} name="arrow-left" size={18}/>
            </a></li>;
          })}</ul>}
        </div>
      </section>}
    </div>
  </main>;
}
