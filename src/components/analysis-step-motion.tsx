import { AnalysisArtwork } from './analysis-choice';
import type { CSSProperties } from 'react';
import type { Choice, Topic } from '@/lib/analysis-guide';

type Motif = 'silk' | 'ripple' | 'pulse' | 'droplets' | 'shine' | 'sunlight';
const topicMotifs: Record<Topic, Motif> = { hair: 'silk', skin: 'ripple' };
const answerMotifs: Record<string, Motif> = {
  drop:'droplets', pore:'ripple', sun:'sunlight', follicle:'silk',
  professional: 'shine', house: 'shine', coins: 'sunlight', economy: 'sunlight', advanced: 'shine', undecided: 'ripple', camera: 'shine', front: 'ripple', back: 'ripple',
  dry: 'droplets', hydration: 'droplets', oily: 'shine', combination: 'ripple',
  normal: 'shine', sensitive: 'ripple', gentle: 'droplets', texture: 'shine',
  straight: 'silk', wavy: 'silk', curly: 'silk', 'dry-ends': 'droplets', tangles: 'silk', scalp: 'ripple',
  'oily-roots': 'shine', 'dry-scalp': 'droplets', flakes: 'ripple', itch: 'ripple', dullness: 'shine',
  home: 'pulse',
};

export type AnalysisMotion = {
  topic: Topic;
  answer: string;
  item: Choice;
  offsetX: number;
  offsetY: number;
  insetTop: number;
  insetBottom: number;
};

function Silk({ answer }: { answer: string }) {
  const sweep = answer === 'straight' ? 'M21 122 Q155 95 293 32'
    : answer === 'curly' || answer === 'tangles' ? 'M8 112 C105 144 94 13 52 62 S169 146 214 59 S300 36 311 54'
    : 'M5 109 C75 138 83 43 156 76 S236 94 308 25';
  return <g className="analysis-silk" fill="none">{[-12, 0, 12].map((dy, i) =>
    <path key={dy} d={sweep} transform={`translate(0 ${dy})`} pathLength="1" className={'analysis-strand strand-' + i}/>)}</g>;
}

const seeds = [[66, 48], [250, 37], [44, 97], [268, 104], [94, 129], [223, 127]];
function Accents({ motif }: { motif: 'droplets' | 'shine' | 'sunlight' }) {
  if (motif === 'sunlight') return <g className="analysis-rays" fill="none">
    {Array.from({ length: 12 }, (_, i) => <path key={i} d="M160 22v-15" transform={`rotate(${i * 30} 160 80)`}/>)}
  </g>;
  return <g>{seeds.map(([x, y], i) => <g key={x} transform={`translate(${x} ${y}) scale(${i % 2 ? .72 : 1})`}>
    <path className="analysis-mote" style={{ animationDelay: i * 30 + 'ms' }}
      d={motif === 'droplets' ? 'M0 -12 C-2 -7 -8 -2 -8 3 a8 8 0 0 0 16 0 C8 -2 2 -7 0 -12Z' : 'M0 -11 Q2 -2 10 0 Q2 2 0 11 Q-2 2 -10 0 Q-2 -2 0 -11Z'}/>
  </g>)}</g>;
}

function Traces({ motif, answer }: { motif: Motif; answer: string }) {
  if (motif === 'silk') return <Silk answer={answer}/>;
  if (motif === 'pulse' || motif === 'ripple') return <g className={'analysis-rings ' + motif} fill="none">
    {[0, 1, 2].map(i => <ellipse key={i} cx="160" cy="80" rx={motif === 'pulse' ? 97 : 114} ry={motif === 'pulse' ? 56 : 36}
      style={{ animationDelay: i * 100 + 'ms' }}/>)}
  </g>;
  return <Accents motif={motif}/>;
}

export function AnalysisStepMotion({ motion }: { motion: AnalysisMotion }) {
  const { topic, answer, item, offsetX, offsetY } = motion;
  const motif = answerMotifs[answer] ?? answerMotifs[item.art ?? ''] ?? topicMotifs[topic];
  const origin = { top: motion.insetTop, bottom: motion.insetBottom, '--launch-x': offsetX + 'px', '--launch-y': offsetY + 'px' } as CSSProperties;
  return <div className="analysis-step-motion" data-topic={topic} data-motif={motif} style={origin} aria-hidden="true">
    <div className="analysis-motion-halo"/>
    <div className="analysis-motion-emblem">
      <svg viewBox="0 0 320 160" focusable="false" className="analysis-motion-traces"><Traces motif={motif} answer={answer}/></svg>
      <AnalysisArtwork item={item} fallback={topic} size={116}/>
      <span className="analysis-motion-label">{item.label}</span>
    </div>
  </div>;
}
