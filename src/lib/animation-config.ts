export type AnimationSlot = 'closed' | 'open' | 'product' | 'angle';
export type ArtworkPoint = [number, number];
export type ArtworkSelection = { slot: AnimationSlot; corners: [ArtworkPoint, ArtworkPoint, ArtworkPoint, ArtworkPoint] };
export type AnimationArtwork = { carton: ArtworkSelection; label: ArtworkSelection };
export type AnimationAppearance = { carton: string; base: string; bottle: string; cap: string; material: 'glass' | 'opaque'; seal: boolean };
export type AnimationBuild = { id: string; version: 1; cartonUrl: string; labelUrl: string; warnings: string[] };
export type UnboxingSceneConfig = {
  template: 'dropper-box' | 'pump-box' | 'jar-box' | 'pouch-box';
  openingSide?: 'left' | 'right';
  dimensions: { boxWidth?: number; boxHeight?: number; boxDepth?: number; productHeight?: number; productDiameter?: number; productWidth?: number; productDepth?: number };
  appearance: AnimationAppearance;
  cartonUrl: string;
  labelUrl: string;
};
export const defaultAppearance: AnimationAppearance = { carton: '#e9dfc7', base: '#38252c', bottle: '#f5fbf8', cap: '#101111', material: 'glass', seal: true };
export const pouchAppearance: AnimationAppearance = { carton: '#f5ccdf', base: '#f4ead5', bottle: '#d9dcdf', cap: '#ffffff', material: 'glass', seal: false };
export const appearanceForTemplate = (template: string) => template === 'pouch-box' ? pouchAppearance : defaultAppearance;
export function defaultArtwork(): AnimationArtwork {
  return {
    carton: { slot: 'closed', corners: [[.2,.15],[.8,.15],[.8,.9],[.2,.9]] },
    label: { slot: 'product', corners: [[.25,.4],[.75,.4],[.75,.78],[.25,.78]] },
  };
}

export const templateDimensions: Record<UnboxingSceneConfig['template'], UnboxingSceneConfig['dimensions']> = {
  'dropper-box': { boxWidth:45, boxHeight:85, boxDepth:32, productHeight:75, productDiameter:24 },
  'pump-box': { boxWidth:65, boxHeight:180, boxDepth:65, productHeight:165, productDiameter:52 },
  'jar-box': { boxWidth:80, boxHeight:65, boxDepth:80, productHeight:55, productDiameter:65 },
  'pouch-box': { boxWidth:160, boxHeight:105, boxDepth:16, productWidth:150, productHeight:96, productDepth:5 },
};
export function sceneConfig(animation: { template:string; openingSide?:'left'|'right'; build?:AnimationBuild; dimensions:UnboxingSceneConfig['dimensions']; appearance?:AnimationAppearance }): UnboxingSceneConfig | undefined {
  if (!animation.build || !(animation.template in templateDimensions)) return undefined;
  return {template:animation.template as UnboxingSceneConfig['template'],openingSide:animation.openingSide,dimensions:animation.dimensions,appearance:animation.appearance??appearanceForTemplate(animation.template),cartonUrl:animation.build.cartonUrl,labelUrl:animation.build.labelUrl};
}
