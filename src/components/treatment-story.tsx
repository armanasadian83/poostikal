'use client';
import {useSiteSettings} from './site-settings-provider';
import Image from 'next/image';
import { Icon, type IconName } from './icons';
import { formatNumber } from '@/lib/format';
import { StoryConnections } from './story-connections';

export function TreatmentStory() {
  const {settings:{story:config}}=useSiteSettings();
  const chapters=config.chapters;
  const chapterFirstSteps=chapters.map((_,index)=>1+chapters.slice(0,index).reduce((total,chapter)=>total+chapter.steps.length,0));
  return (
    <section className="treatment-story" id="treatment-story" aria-label={config.alt}>
      <div className="treatment-story-backdrop" aria-hidden="true">
        <div className="treatment-story-photo">
          <Image
            className="treatment-story-image"
            src={config.image}
            alt=""
            fill
            sizes="(max-aspect-ratio: 1945/809) 241vh, 100vw"
            quality={95}
          />
        </div>
      </div>
      <StoryConnections/>
      <ol className="treatment-story-content container" role="list">
        {chapters.map((chapter, chapterIndex) => (
          <li className="treatment-story-row" key={chapterIndex}>
            <h2 className="treatment-story-chapter"><span aria-hidden="true">{formatNumber(chapterIndex + 1).padStart(2, '۰')}</span>{chapter.title}</h2>
            <ol className="treatment-story-steps" role="list" start={chapterFirstSteps[chapterIndex]} data-step-count={chapter.steps.length}>
              {chapter.steps.map((step, stepIndex) => (
                <li className="treatment-story-step" key={stepIndex}>
                  <article className="treatment-story-card">
                    <div className="treatment-story-card-top" aria-hidden="true">
                      <span>{formatNumber(chapterFirstSteps[chapterIndex] + stepIndex).padStart(2, '۰')}</span>
                      <Icon name={step.icon as IconName} size={23}/>
                    </div>
                    <h3>{step.title}</h3>
                    <p>{step.copy}</p>
                  </article>
                  {stepIndex < chapter.steps.length - 1 ? <span className="treatment-story-arrow" aria-hidden="true"><Icon name="arrow-left" size={16}/></span> : null}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </section>
  );
}
