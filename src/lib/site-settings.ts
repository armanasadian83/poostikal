import defaults from '../../backend/src/site-defaults.json';
export const defaultSiteSettings = defaults;
export type SiteSettings = Omit<typeof defaults,'contact'> & { contact: Omit<typeof defaults.contact,'socialLinks'> & { socialLinks: {label:string;href:string}[] } };
export type SiteSection = keyof SiteSettings;
export type SiteSnapshot = {version:number;settings:SiteSettings;store:{name:string;description:string}};
export const defaultSiteSnapshot:SiteSnapshot = {version:0,settings:defaults,store:{name:'پوستیکال',description:'مراقبت تخصصی پوست، مو و زیبایی'}};
export const completeSiteSnapshot=(value:SiteSnapshot):SiteSnapshot=>({...value,settings:{...defaultSiteSettings,...value.settings}});
