'use client';
import {useSiteSettings} from './site-settings-provider';


import {SiteSettingLink} from './site-setting-link';
import { Brand } from './brand';
import { Icon } from './icons';
import { SocialMark, socialIdentity, type SocialPlatform } from './social-mark';
import { AskPoostikalLink, SkinAnalysisLink } from './chat-transition';


export function SiteFooter() {
  const {settings:{footer:config,contact}}=useSiteSettings();
  if(!config.visible)return null;
  const socialLinks = contact.socialLinks.map(link => ({...link, kind: socialIdentity(link.href).kind}));
  const platforms: {kind: SocialPlatform; label: string}[] = [
    {kind: 'whatsapp', label: 'واتساپ'},
    {kind: 'instagram', label: 'اینستاگرام'},
    {kind: 'telegram', label: 'تلگرام'},
  ];

  return (
    <footer className="site-footer poostikal-footer" aria-label="پاورقی پوستیکال">
      <div className="footer-atmosphere" aria-hidden="true"><Icon name="lips" size={260}/></div>
      <div className="container footer-content">
        <div className="footer-columns">
          <section className="footer-brand-column" aria-label="پوستیکال">
            <Brand footer/>
            <h2 style={{whiteSpace:"pre-line"}}>{config.title}</h2>
            <p>{config.description}</p>
            {config.showAnalysis?<SkinAnalysisLink className="footer-analysis-link">
              <Icon name="sparkles" size={19}/><span>{config.analysisLabel}</span><Icon name="arrow-left" size={18}/>
            </SkinAnalysisLink>:null}
          </section>

          <nav className="footer-nav-group" aria-labelledby="footer-shop-title">
            <h2 id="footer-shop-title">{config.shopTitle}</h2>
            <ul>{config.shopLinks.map((link,index)=><li key={index}><SiteSettingLink {...link}/></li>)}</ul>
          </nav>

          <nav className="footer-nav-group" aria-labelledby="footer-discover-title">
            <h2 id="footer-discover-title">{config.discoverTitle}</h2>
            <ul>{config.discoverLinks.map((link,index)=><li key={index}><SiteSettingLink {...link}/></li>)}</ul>
          </nav>

          {config.showAsk?<section className="footer-ask-card" aria-labelledby="footer-ask-title">
            <span className="footer-ask-icon" aria-hidden="true"><Icon name="message" size={27}/><Icon name="sparkles" size={14}/></span>
            <h2 id="footer-ask-title">{config.askTitle}</h2>
            <p>{config.askDescription}</p>
            <AskPoostikalLink className="footer-ask-link"><span>{config.askLabel}</span><Icon name="arrow-left" size={20}/></AskPoostikalLink>
            <small>{config.askCaption}</small>
          </section>:null}
        </div>

        {socialLinks.some(link => link.kind !== 'link') && <nav className="footer-social-links" aria-label="شبکه‌های اجتماعی پوستیکال">
          {platforms.map(({kind, label}) => {
            const link = socialLinks.find(item => item.kind === kind);
            return link && <a key={kind} href={link.href} aria-label={label} title={label}><SocialMark kind={kind}/></a>;
          })}
        </nav>}
        <div className="footer-base">
          <div className="footer-signature"><Icon name="lips" size={25}/><span>{config.signature}</span></div>
          <button className="footer-back-top" type="button" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}>
            <span>{config.backTopLabel}</span><Icon name="arrow-left" size={17}/>
          </button>
        </div>
        <p className="footer-preview-notice">{config.notice}</p>
      </div>
    </footer>
  );
}
