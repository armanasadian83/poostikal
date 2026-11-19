'use client';
import {useSiteSettings} from './site-settings-provider';
import { SkinAnalysisLink } from './chat-transition';

import { Icon } from './icons';
import { SkinModel } from './skin-model';

export function SkinQuizBanner() {
  const {settings:{home:config}}=useSiteSettings();

  return <section className="skin-quiz-banner container" id="skin-quiz-banner" aria-labelledby="routine-title">
    <div className="skin-quiz-watermark" aria-hidden="true"><Icon name="lips" size={180}/></div>
    <div className="skin-quiz-copy">
      <h2 id="routine-title">{config.quizTitle}</h2>
      <p>{config.quizDescription}</p>
      <SkinAnalysisLink className="skin-quiz-cta">{config.quizButton}<Icon name="arrow-left" size={22}/></SkinAnalysisLink>
    </div>
    <div className="skin-quiz-art" aria-hidden="true">
      <div className="skin-quiz-glow"/>
      <SkinModel/>
    </div>
  </section>;
}
