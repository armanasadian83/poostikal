import { BannerBackdrop } from '@/components/banner-backdrop';
import { AnalysisArrivalKiss } from '@/components/chat-transition';
import { Quiz } from '@/components/quiz';
import { publicMetadata } from '@/lib/seo';
import './analysis.css';

export const generateMetadata = () => publicMetadata({
  path: '/skin-analysis',
  title: 'آنالیز پوست و مو',
  description: 'با چند سؤال دربارهٔ پوست یا مو، راهنمای مرتبط با دغدغه‌ات را در پوستیکال پیدا کن.',
});

export default function SkinAnalysisPage() {
  return (
    <main id="main-content" className="analysis-page">
      <BannerBackdrop />
      <Quiz />
      <AnalysisArrivalKiss />
    </main>
  );
}
