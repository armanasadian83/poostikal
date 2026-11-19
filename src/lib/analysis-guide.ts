import definitions from '../../backend/src/analysis-options.json';

export type Topic = keyof typeof definitions.guides;
export type Choice = { id: string; label: string; art?: string; caption?: string; cardTitle?: string; x?: number; y?: number };
export type Goal = Choice & { tip: string; category?: string; query?: string };
type Guide = { profileQuestion: string; profiles: (Choice & { tip: string })[]; goalQuestion: string; groups: {label: string; goals: Goal[]}[] };
export const guides: Record<Topic, Guide> = definitions.guides;
export const { audiences, topics, packages, areas } = definitions;
export const skinAreas = areas.filter(area => area.id !== 'scalp');
// Keep the label in staff summaries for submissions recorded before the free-form area was retired.
export const hairAreas = definitions.hairAreas;
export const hairChoices = [...hairAreas.scalp, ...hairAreas.structure];
export const scalpGroups = definitions.guides.hair.scalpGroups;
export const scalpChoices = scalpGroups.flatMap(group => group.choices);
const recordedAreas: Choice[] = [...areas,...hairChoices,{id:'other',label:'ناحیهٔ دیگری'}];
export type AnalysisAnswers<T extends string = Topic> = {
  audience: string; topic: T; profile: string; profileNote: string; goals: string[]; note: string;
  packageId: string; areas: string[]; areaNote: string; scalpConditions?: string[]; scalpNote?: string;
};
export type RecordedAnswers<T extends string = Topic> = Omit<AnalysisAnswers<T>,'packageId'> & { packageId?: string; budget?: string; customBudget?: number | null; plan?: string };
export type AnalysisOutcome = { id: string; status: 'pending' | 'guided' | 'reviewed'; guidance: string | null };
export type AnalysisSave = {state:'preview'|'saving'|'unconfirmed'} | {state:'saved';id:string};
export const reviewLabels = { pending: 'نیاز به بررسی', guided: 'راهنمای هوشمند آماده شد', reviewed: 'بررسی شده' };
export function answerRows(a: RecordedAnswers<string>, guide: {profiles: Choice[]; groups: {goals: Goal[]}[]}, topicLabel = topics.find(t => t.id === a.topic)?.label ?? ''): [string, string][] {
  const label = (choices: Choice[], id: string) => choices.find(c => c.id === id)?.label ?? '';
  const labels = (choices: Choice[], ids: string[]) => ids.map(id => label(choices,id)).join('، ');
  const amount = a.budget === 'custom' && a.customBudget ? a.customBudget.toLocaleString('fa-IR') + ' تومان' : label(definitions.budgets, a.budget ?? '');
  return [
    ['محل استفاده', label(audiences,a.audience)], ['موضوع', topicLabel], ['مشخصات', label(guide.profiles,a.profile)],
    ['توضیح مشخصات', a.profileNote],
    ['وضعیت پوست سر', a.topic === 'hair' ? labels(scalpChoices,a.scalpConditions ?? []) : ''],
    ['توضیح پوست سر', a.topic === 'hair' ? a.scalpNote ?? '' : ''],
    ['دغدغه‌ها', labels(guide.groups.flatMap(g => g.goals),a.goals)], ['توضیح دغدغه',a.note],
    ['بسته', label(packages,a.packageId ?? '')], ['بودجه', amount], ['ترجیح خرید', label(definitions.plans,a.plan ?? '')], ['ناحیه', labels(recordedAreas,a.areas)], ['توضیح ناحیه', a.areaNote],
  ].filter((row): row is [string,string] => Boolean(row[1]));
}
export function artUrl(art: string) {
  return '/images/analysis/' + art + (['hair','skin'].includes(art) ? '-illustration' : '') + '.webp';
}
