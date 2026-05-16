import 'server-only';

import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Bookmark,
  FileText,
  Grid2X2,
  Lightbulb,
  List,
  Shield,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react';
import type { PaperEvaluation, PaperSource } from '@prisma/client';
import { runsRepo } from '@/server/repos/runs';
import {
  runResultsRepo,
  type RunResultWithDetail,
} from '@/server/repos/runResults';
import { trendsRepo, type RunSummary, type TagCount } from '@/server/repos/trends';
import { selectBestEvaluation } from '@/server/lib/select-evaluation';
import { formatAuthors, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

const SOURCE_LABEL: Record<PaperSource['source'], string> = {
  ARXIV: 'arXiv',
  OPENREVIEW: 'OpenReview',
  HUGGINGFACE: 'Hugging Face',
};

const TOPIC_FALLBACKS = [
  'Computer Vision',
  'Multimodal',
  'RAG',
  'Robotics',
  'Diffusion Models',
  'AI Safety',
];

const HOME_FEED_PAGE_SIZE = 10;

interface HomePageProps {
  searchParams: Promise<{ page?: string }>;
}

function parsePageParam(value: string | undefined): number {
  if (!value) return 1;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function EmptyState() {
  return (
    <main className="mx-auto max-w-[1760px] px-4 py-6 sm:px-6 lg:px-12">
      <section className="grid min-h-[420px] place-items-center rounded-[10px] border border-dashed border-[#d9deea] bg-white px-6 py-12 text-center shadow-[0_18px_50px_rgba(31,42,68,0.08)]">
        <div className="max-w-2xl">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-[#eef0ff] text-[#5b4df1]">
            <Sparkles aria-hidden className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-semibold tracking-normal text-[#111827]">
            尚未匯入 agent 更新
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#667085]">
            PaperScout 目前是唯讀檢視器。請先在本機執行 collection 與
            evaluation skills，再將 run 目錄匯入資料庫。
          </p>
          <pre className="mx-auto mt-6 max-w-xl overflow-x-auto rounded-lg bg-[#f2f4f8] p-4 text-left font-mono text-xs text-[#344054]">
            {`# 1. Collect candidates\n#    Claude Code -> /collect-papers\n# 2. Evaluate the top 15\n#    Claude Code -> /evaluate-papers\n# 3. Ingest into the DB\nnpm run ingest data/runs/<YYYY-MM-DD-HHMM>`}
          </pre>
          <p className="mt-6 text-sm text-[#667085]">
            你仍可前往{' '}
            <Link href="/library" className="font-semibold text-[#392ee5] underline">
              論文庫
            </Link>{' '}
            瀏覽已儲存的論文。
          </p>
        </div>
      </section>
    </main>
  );
}

function HeroArt() {
  return (
    <div className="relative min-h-[176px]" aria-hidden>
      <div className="absolute top-1 left-[8%] h-[157px] w-[188px] overflow-hidden rounded-[9px] bg-white shadow-[0_22px_55px_rgba(83,88,135,0.16)] max-sm:left-0 max-sm:w-[205px]">
        <div className="h-5 bg-[#dbc9ff]" />
        <div className="absolute top-2.5 left-4 flex gap-2">
          <i className="h-1.5 w-1.5 rounded-full bg-[#6c63ff]" />
          <i className="h-1.5 w-1.5 rounded-full bg-[#77d5cc]" />
          <i className="h-1.5 w-1.5 rounded-full bg-[#99a2ff]" />
        </div>
        <div className="absolute top-[34px] left-[19px] grid h-7 w-7 place-items-center rounded-lg bg-[#eef0ff] text-[#8174ff]">
          <Shield aria-hidden className="h-4 w-4" />
        </div>
        <div className="absolute top-9 right-5 left-[58px] grid gap-[13px]">
          <i className="h-[7px] w-[62px] rounded-full bg-[#b8a4ff]" />
          <i className="h-[7px] w-[108px] rounded-full bg-[#e4e7f1]" />
          <i className="h-[7px] w-[83px] rounded-full bg-[#e4e7f1]" />
          <i className="h-[7px] w-[96px] rounded-full bg-[#e4e7f1]" />
        </div>
        <div className="absolute bottom-[31px] left-[19px] flex h-11 items-end gap-1">
          {[29, 38, 26, 44, 33].map((height) => (
            <i
              key={height}
              className="w-[9px] rounded-t-[3px] bg-gradient-to-b from-[#9cb2ff] to-[#6f7df7]"
              style={{ height }}
            />
          ))}
        </div>
      </div>
      <div className="absolute top-[77px] right-[5%] grid min-h-[66px] w-[178px] grid-cols-[38px_1fr] items-center gap-3 rounded-[9px] bg-white/90 p-3.5 shadow-[0_18px_42px_rgba(83,88,135,0.14)] max-sm:right-0 max-sm:w-[190px]">
        <div className="grid h-[38px] w-[38px] place-items-center rounded-[13px] bg-[#eef0ff] text-[#5b4df1]">
          <Sparkles aria-hidden className="h-6 w-6" />
        </div>
        <div className="grid gap-[9px]">
          <i className="h-[7px] rounded-full bg-[#dfe3ef]" />
          <i className="h-[7px] rounded-full bg-[#dfe3ef]" />
          <i className="h-[7px] rounded-full bg-[#dfe3ef]" />
        </div>
      </div>
    </div>
  );
}

function TopicChips({ tags }: { tags: TagCount[] }) {
  const topics = tags.length > 0 ? tags.map((t) => t.tag) : TOPIC_FALLBACKS;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-[#5f6b7a]">
      <span>熱門主題：</span>
      {topics.slice(0, 7).map((topic) => (
        <Link
          key={topic}
          href={`/library?tags=${encodeURIComponent(topic)}`}
          className="inline-flex min-h-[27px] items-center rounded-full bg-[#dfe4ff] px-3.5 text-[13px] font-bold text-[#2734b7]"
        >
          {topic}
        </Link>
      ))}
    </div>
  );
}

function Hero({ summary }: { summary: RunSummary }) {
  return (
    <section
      className="grid min-h-[216px] items-center gap-10 rounded-[10px] bg-[radial-gradient(circle_at_68%_30%,rgba(151,124,255,0.22),transparent_22%),linear-gradient(100deg,#edf7ff_0%,#f8f0ff_51%,#eaf4ff_100%)] px-5 py-6 shadow-[0_18px_50px_rgba(31,42,68,0.08)] md:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)] lg:px-24 xl:px-44"
      aria-labelledby="hero-title"
    >
      <div className="max-w-[700px]">
        <h1
          id="hero-title"
          className="mb-3.5 text-[29px] leading-[1.12] font-extrabold tracking-normal text-[#111827] md:text-[34px]"
        >
          更快找到值得閱讀的論文。
        </h1>
        <p className="mb-5 text-sm text-[#273142]">
          AI 會依據最新匯入的研究資料，摘要、評分並標註最相關的論文。
        </p>
        <label className="grid min-h-[54px] grid-cols-[auto_1fr_auto] items-center gap-3.5 rounded-[9px] border border-[#d9deea] bg-white pr-2 pl-5 shadow-[0_12px_26px_rgba(45,52,88,0.14)] max-sm:grid-cols-[auto_1fr] max-sm:p-3">
          <Sparkles aria-hidden className="h-5 w-5 text-[#5b4df1]" />
          <input
            type="text"
            aria-label="輸入研究興趣"
            placeholder="輸入你感興趣的研究主題，例如：LLM agents、RAG、diffusion models..."
            className="min-w-0 border-0 bg-transparent text-[15px] text-[#475467] outline-none placeholder:text-[#98a2b3]"
          />
          <button
            type="button"
            disabled
            aria-label="送出研究興趣"
            title="V1 目前不儲存個人化研究興趣"
            className="grid h-[38px] w-[38px] cursor-not-allowed place-items-center rounded-[7px] bg-gradient-to-br from-[#7868ff] to-[#4437e7] text-white shadow-[0_10px_24px_rgba(91,77,241,0.28)] max-sm:col-span-2 max-sm:w-full"
          >
            <ArrowRight aria-hidden className="h-5 w-5" />
          </button>
        </label>
        <TopicChips tags={summary.topTags} />
      </div>
      <HeroArt />
    </section>
  );
}

function FeedToolbar() {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#e5e9f3] px-5 pt-2.5 max-lg:flex-col max-lg:items-stretch">
      <div className="flex min-w-0 gap-6 overflow-x-auto" role="tablist" aria-label="論文列表篩選">
        <button
          type="button"
          className="inline-flex items-center gap-2 border-b-[3px] border-[#5b4df1] pb-3 text-sm font-extrabold whitespace-nowrap text-[#392ee5]"
          role="tab"
          aria-selected="true"
        >
          <Star aria-hidden className="h-4 w-4" />
          為你推薦
        </button>
        {[
          { label: '熱門趨勢', icon: TrendingUp },
          { label: '最新發佈', icon: Shield },
          { label: '高分推薦', icon: BarChart3 },
        ].map(({ label, icon: Icon }) => (
          <button
            key={label}
            type="button"
            disabled
            className="inline-flex cursor-not-allowed items-center gap-2 border-b-[3px] border-transparent pb-3 text-sm whitespace-nowrap text-[#344054] opacity-80"
            role="tab"
          >
            <Icon aria-hidden className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 pb-2.5 max-sm:flex-wrap" aria-label="列表控制">
        {['領域', '時間', '排序依據：AI 評分'].map((label) => (
          <select
            key={label}
            aria-label={label}
            disabled
            className="min-h-9 rounded-lg border border-[#d7deea] bg-white px-3 text-sm text-[#344054] disabled:opacity-80 max-sm:flex-1"
          >
            <option>{label}</option>
          </select>
        ))}
        <div className="flex" aria-label="檢視模式">
          <button
            type="button"
            aria-label="卡片檢視"
            className="grid h-9 w-[38px] place-items-center rounded-l-lg border border-[#d7deea] bg-[#ebe9ff] text-[#5b4df1]"
          >
            <Grid2X2 aria-hidden className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled
            aria-label="列表檢視"
            className="-ml-px grid h-9 w-[38px] cursor-not-allowed place-items-center rounded-r-lg border border-[#d7deea] bg-white text-[#344054] opacity-80"
          >
            <List aria-hidden className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function findSourceLink(paper: RunResultWithDetail['paper'], source: PaperSource['source']) {
  return paper.sources.find((s) => s.source === source)?.sourceUrl ?? null;
}

function ScoreRing({ evaluation }: { evaluation: PaperEvaluation | null }) {
  if (!evaluation) {
    return (
      <div className="grid h-16 w-16 place-items-center rounded-full bg-[#eef2f8] text-center text-xs text-[#667085]">
        N/A
      </div>
    );
  }
  const score = Math.max(0, Math.min(100, evaluation.totalScore));
  return (
    <div
      className="grid h-16 w-16 shrink-0 place-items-center rounded-full"
      style={{
        background: `radial-gradient(circle at center, #fff 0 59%, transparent 60%), conic-gradient(#5b4df1 0 ${score}%, #e8ecf5 ${score}% 100%)`,
      }}
    >
      <div className="text-center">
        <strong className="block text-lg leading-none text-[#392ee5]">
          {(score / 10).toFixed(1)}
        </strong>
        <span className="block text-xs text-[#667085]">/10</span>
      </div>
    </div>
  );
}

function PlaceholderThumb({ index }: { index: number }) {
  if (index % 2 === 0) {
    return (
      <div className="relative h-44 min-h-44 overflow-hidden rounded-lg border border-[#dce3ef] bg-[#fbfcff]">
        <span className="absolute top-[65px] left-6 grid min-h-[38px] min-w-[58px] place-items-center rounded border border-[#8ba0b8] bg-white text-[10px] text-[#344054]">
          Query
        </span>
        <span className="absolute top-[108px] left-[88px] grid min-h-[38px] min-w-[58px] place-items-center rounded border border-[#8ba0b8] bg-white text-[10px] text-[#344054]">
          Docs
        </span>
        <span className="absolute top-[83px] left-[135px] grid min-h-[38px] min-w-[58px] place-items-center rounded border border-[#8ba0b8] bg-[#dff5df] text-[10px] text-[#344054]">
          Model
        </span>
        <span className="absolute top-[83px] left-[208px] grid min-h-[38px] min-w-[58px] place-items-center rounded border border-[#8ba0b8] bg-[#d9edff] text-[10px] text-[#344054]">
          LLM
        </span>
        <span className="absolute top-[84px] left-[79px] h-0.5 w-[55px] bg-[#98a2b3] after:absolute after:top-[-4px] after:right-[-1px] after:border-y-[5px] after:border-l-[7px] after:border-y-transparent after:border-l-[#98a2b3]" />
      </div>
    );
  }

  return (
    <div className="grid h-44 min-h-44 grid-cols-3 gap-3 overflow-hidden rounded-lg border border-[#dce3ef] bg-[#fbfcff] p-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="relative min-h-[68px] border-b border-l border-[#ccd5e2] bg-[linear-gradient(#eef2f8_1px,transparent_1px),linear-gradient(90deg,#eef2f8_1px,transparent_1px)] bg-[length:100%_18px,22px_100%] before:absolute before:inset-[10px_9px_11px] before:border-t-[3px] before:border-[#5b7cff]"
        />
      ))}
      <div className="col-span-3 grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <i
            key={i}
            className="min-h-[42px] rounded-[5px] bg-[radial-gradient(circle_at_30%_30%,#f7d38d_0_15%,transparent_16%),radial-gradient(circle_at_70%_50%,#82c7a5_0_18%,transparent_19%),linear-gradient(135deg,#bdc8e7,#f1f4fb)]"
          />
        ))}
      </div>
    </div>
  );
}

function PaperThumb({ result, index }: { result: RunResultWithDetail; index: number }) {
  if (!result.paper.figure) return <PlaceholderThumb index={index} />;
  const labelPart = result.paper.figure.figureLabel ?? 'Highlight figure';
  const captionPart = result.paper.figure.caption ? `: ${result.paper.figure.caption}` : '';
  return (
    // eslint-disable-next-line @next/next/no-img-element -- served by the existing cache-controlled route.
    <img
      src={`/api/papers/${result.paper.id}/figure`}
      alt={`${labelPart}${captionPart}`}
      loading="lazy"
      decoding="async"
      className="h-44 min-h-44 rounded-lg border border-[#dce3ef] bg-[#fbfcff] object-cover"
    />
  );
}

function ExternalLinks({
  result,
  evaluation,
}: {
  result: RunResultWithDetail;
  evaluation: PaperEvaluation | null;
}) {
  const paper = result.paper;
  const arxivUrl = findSourceLink(paper, 'ARXIV');
  const openReviewUrl = findSourceLink(paper, 'OPENREVIEW');
  const huggingFaceUrl = findSourceLink(paper, 'HUGGINGFACE');
  const firstExternal =
    paper.pdfUrl ?? arxivUrl ?? openReviewUrl ?? huggingFaceUrl ?? paper.codeLinks[0]?.codeUrl;

  return (
    <div className="flex justify-between gap-4 text-[13px] font-bold text-[#392ee5]">
      <Link href={`/papers/${paper.id}`}>查看摘要</Link>
      {firstExternal ? (
        <a href={firstExternal} target="_blank" rel="noreferrer">
          開啟論文 ↗
        </a>
      ) : evaluation ? (
        <span>{evaluation.evaluationStage}</span>
      ) : null}
    </div>
  );
}

function HomePaperCard({
  result,
  index,
}: {
  result: RunResultWithDetail;
  index: number;
}) {
  const paper = result.paper;
  const evaluation = selectBestEvaluation(paper.evaluations);
  const visibleTags = paper.tags.slice(0, 5);
  const summary = evaluation?.summary ?? '此論文已匯入 PaperScout，可點入查看來源、摘要與詳細評估。';
  const reason =
    evaluation?.recommendationReason ??
    evaluation?.rankingExplanation ??
    '此論文在本次 agent 評估中被標記為推薦閱讀。';

  return (
    <article className="grid grid-cols-1 items-start gap-4 rounded-[10px] border border-[#dfe5ee] bg-white p-4 shadow-[0_10px_30px_rgba(29,41,57,0.05)] xl:grid-cols-[280px_minmax(0,1fr)_230px]">
      <PaperThumb result={result} index={index} />

      <div className="min-w-0">
        <h2 className="mb-2 text-lg leading-snug font-semibold tracking-normal text-[#111827]">
          <Link href={`/papers/${paper.id}`} className="hover:text-[#392ee5]">
            {paper.title}
          </Link>
        </h2>
        <div className="mb-2 flex flex-wrap gap-2 text-[13px] text-[#667085]">
          <span>{formatAuthors(paper.authors, 3)}</span>
          <span>|</span>
          <span>{SOURCE_LABEL[paper.primarySource]}</span>
          <span>|</span>
          <span>{formatDate(paper.publishedDate)}</span>
        </div>
        <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-[#273142]">
          {summary}
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {visibleTags.map((tag) => (
            <Link
              key={tag.id}
              href={`/library?tags=${encodeURIComponent(tag.tag)}`}
              className="inline-flex min-h-[26px] items-center rounded-full bg-[#eef0ff] px-3 text-[13px] font-bold text-[#3442c8]"
            >
              {tag.tag}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled
            className="inline-flex min-h-[33px] cursor-not-allowed items-center gap-2 rounded-[7px] border border-[#d9e1ee] bg-white px-3 text-[13px] text-[#344054] opacity-80"
          >
            <Star aria-hidden className="h-4 w-4" />
            收藏
          </button>
          <button
            type="button"
            disabled
            className="inline-flex min-h-[33px] cursor-not-allowed items-center gap-2 rounded-[7px] border border-[#d9e1ee] bg-white px-3 text-[13px] text-[#344054] opacity-80"
          >
            <Bookmark aria-hidden className="h-4 w-4" />
            稍後閱讀
          </button>
          <span className="text-[13px] text-[#667085]">閱讀時間：約 18 分鐘</span>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3.5">
        <div className="flex items-center gap-4">
          <ScoreRing evaluation={evaluation} />
          <span className="text-[13px] whitespace-nowrap text-[#344054]">AI 評分 ⓘ</span>
        </div>
        <div className="min-h-[68px] rounded-lg bg-[#eaf8f4] px-3.5 py-3 text-sm leading-snug text-[#195b50]">
          <strong className="mb-1.5 flex items-center gap-2 text-[13px] text-[#0f9f86]">
            <Lightbulb aria-hidden className="h-4 w-4" />
            推薦原因
          </strong>
          <span className="line-clamp-3">{reason}</span>
        </div>
        <ExternalLinks result={result} evaluation={evaluation} />
      </div>
    </article>
  );
}

function HotTagsCard({ tags }: { tags: TagCount[] }) {
  const visible = tags.slice(0, 8);
  return (
    <section className="rounded-[10px] border border-[#e5e9f3] bg-white px-5 py-4 shadow-[0_18px_50px_rgba(31,42,68,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[17px] font-semibold tracking-normal text-[#111827]">
          熱門標籤
        </h3>
        <Link href="/library" className="text-xs font-bold text-[#5b4df1]">
          查看全部
        </Link>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-[#667085]">尚無標籤。</p>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {visible.map((tag) => (
            <Link
              key={tag.tag}
              href={`/library?tags=${encodeURIComponent(tag.tag)}`}
              className="inline-flex min-h-[30px] items-center gap-1.5 rounded-full bg-[#eef0ff] px-3.5 text-[13px] font-bold text-[#2734b7]"
            >
              {tag.tag}
              <b className="text-xs text-[#6570e8]">{tag.count}</b>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function RecentRecommendationsCard({
  recommended,
}: {
  recommended: RunResultWithDetail[];
}) {
  return (
    <section className="rounded-[10px] border border-[#e5e9f3] bg-white px-5 py-4 shadow-[0_18px_50px_rgba(31,42,68,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[17px] font-semibold tracking-normal text-[#111827]">
          最近推薦
        </h3>
        <Link href="/library" className="text-xs font-bold text-[#5b4df1]">
          查看全部
        </Link>
      </div>
      <div className="grid gap-4">
        {recommended.slice(0, 3).map((r) => (
          <article key={r.id} className="grid grid-cols-[38px_1fr_auto] items-start gap-3">
            <span className="grid h-[42px] w-[34px] place-items-center rounded-md border border-[#d5dcf2] bg-[#f4f6ff] text-[#5b4df1]">
              <FileText aria-hidden className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h4 className="mb-1 line-clamp-2 text-[13px] leading-snug font-semibold text-[#111827]">
                <Link href={`/papers/${r.paper.id}`}>{r.paper.title}</Link>
              </h4>
              <p className="text-xs text-[#667085]">
                {SOURCE_LABEL[r.paper.primarySource]} | {formatDate(r.paper.publishedDate)}
              </p>
            </div>
            <span className="text-[#5b4df1]">♡</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function SourceMixCard({ summary }: { summary: RunSummary }) {
  const total = summary.sources.reduce((acc, source) => acc + source.count, 0);
  return (
    <section className="rounded-[10px] border border-[#e5e9f3] bg-white px-5 py-4 shadow-[0_18px_50px_rgba(31,42,68,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[17px] font-semibold tracking-normal text-[#111827]">
          來源分布
        </h3>
      </div>
      {total === 0 ? (
        <p className="text-sm text-[#667085]">尚無來源資料。</p>
      ) : (
        <ul className="grid gap-3">
          {summary.sources.map((source) => (
            <li key={source.source} className="flex items-center justify-between text-sm">
              <span className="text-[#344054]">{SOURCE_LABEL[source.source]}</span>
              <span className="font-semibold tabular-nums text-[#392ee5]">
                {source.count} ({Math.round((source.count / total) * 100)}%)
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PersonalCard() {
  return (
    <section className="grid grid-cols-[1fr_92px] items-center gap-4 rounded-[10px] border border-[#e5e9f3] bg-[radial-gradient(circle_at_88%_30%,rgba(124,101,255,0.14),transparent_26%),#fff] px-5 py-4 shadow-[0_18px_50px_rgba(31,42,68,0.08)] max-sm:grid-cols-1">
      <div>
        <h3 className="mb-2 text-[17px] font-semibold tracking-normal text-[#111827]">
          個人化推薦設定
        </h3>
        <p className="mb-4 text-[13px] text-[#667085]">
          讓 AI 更了解你，獲得更精準的推薦
        </p>
        <button
          type="button"
          disabled
          className="inline-flex min-h-[38px] cursor-not-allowed items-center rounded-[7px] bg-gradient-to-br from-[#7868ff] to-[#4437e7] px-5 text-sm font-extrabold text-white opacity-85"
        >
          設定我的研究興趣
        </button>
      </div>
      <div
        aria-hidden
        className="relative h-[84px] w-[84px] rounded-[45%_45%_45%_38%] border-[3px] border-[#917eff] before:absolute before:top-[22px] before:left-[19px] before:h-[33px] before:w-[49px] before:rounded-t-full before:border-[3px] before:border-b-0 before:border-[#917eff] after:absolute after:top-[38px] after:left-[30px] after:h-2 after:w-2 after:rounded-full after:bg-[#917eff] after:shadow-[19px_-6px_0_#917eff,17px_15px_0_#917eff]"
      />
    </section>
  );
}

function Pagination({
  currentPage,
  totalPages,
  totalItems,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
}) {
  if (totalPages <= 1) {
    return (
      <p className="text-center text-sm text-[#667085]">
        已顯示全部 {totalItems} 篇論文
      </p>
    );
  }

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
  const pageHref = (page: number) => (page === 1 ? '/' : `/?page=${page}`);

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e9f3] pt-4 text-sm"
      aria-label="論文分頁"
    >
      <p className="text-[#667085]">
        第 {currentPage} / {totalPages} 頁 · 共 {totalItems} 篇論文
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {currentPage > 1 ? (
          <Link
            href={pageHref(currentPage - 1)}
            className="inline-flex min-h-9 items-center rounded-lg border border-[#d7deea] bg-white px-3 font-semibold text-[#344054] hover:text-[#392ee5]"
          >
            上一頁
          </Link>
        ) : (
          <span className="inline-flex min-h-9 cursor-not-allowed items-center rounded-lg border border-[#d7deea] bg-[#f2f4f8] px-3 font-semibold text-[#98a2b3]">
            上一頁
          </span>
        )}

        {pageNumbers.map((page) => (
          <Link
            key={page}
            href={pageHref(page)}
            aria-current={page === currentPage ? 'page' : undefined}
            className={
              page === currentPage
                ? 'grid h-9 min-w-9 place-items-center rounded-lg bg-[#5b4df1] px-3 font-bold text-white'
                : 'grid h-9 min-w-9 place-items-center rounded-lg border border-[#d7deea] bg-white px-3 font-semibold text-[#344054] hover:text-[#392ee5]'
            }
          >
            {page}
          </Link>
        ))}

        {currentPage < totalPages ? (
          <Link
            href={pageHref(currentPage + 1)}
            className="inline-flex min-h-9 items-center rounded-lg border border-[#d7deea] bg-white px-3 font-semibold text-[#344054] hover:text-[#392ee5]"
          >
            下一頁
          </Link>
        ) : (
          <span className="inline-flex min-h-9 cursor-not-allowed items-center rounded-lg border border-[#d7deea] bg-[#f2f4f8] px-3 font-semibold text-[#98a2b3]">
            下一頁
          </span>
        )}
      </div>
    </nav>
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { page } = await searchParams;
  const run = await runsRepo.latestCompletedForDisplay();
  if (!run) return <EmptyState />;

  const requestedPage = parsePageParam(page);

  const [summary, recommended, totalResults] = await Promise.all([
    trendsRepo.getRunSummary(run.id),
    runResultsRepo.findByRunWithDetail(run.id, { recommendedOnly: true }),
    runResultsRepo.countByRun(run.id),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalResults / HOME_FEED_PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const results = await runResultsRepo.findByRunWithDetail(run.id, {
    recommendedOnly: false,
    limit: HOME_FEED_PAGE_SIZE,
    offset: (currentPage - 1) * HOME_FEED_PAGE_SIZE,
  });

  return (
    <main className="mx-auto max-w-[1760px] px-4 py-4 sm:px-6 lg:px-12">
      <Hero summary={summary} />

      <div className="mt-5 grid gap-9 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section
          className="rounded-[10px] border border-[#e5e9f3] bg-white shadow-[0_18px_50px_rgba(31,42,68,0.08)]"
          aria-labelledby="feed-title"
        >
          <FeedToolbar />
          <div className="sr-only" id="feed-title">
            推薦論文
          </div>
          <div className="grid gap-3.5 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#667085]">
              <span>
                最新 agent 更新：{formatDate(run.completedAt ?? run.createdAt)} · 已收集{' '}
                {summary.totalPapers} 篇 · 推薦 {summary.recommendedCount} 篇 · 目前顯示第{' '}
                {currentPage} 頁
              </span>
              <Link href={`/runs/${run.id}`} className="font-semibold text-[#392ee5]">
                查看完整 run →
              </Link>
            </div>

            {results.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#d9deea] bg-[#fbfcff] p-6 text-sm text-[#667085]">
                本次 run 尚未產生可顯示的論文。
              </div>
            ) : (
              results.map((result, index) => (
                <HomePaperCard key={result.id} result={result} index={index} />
              ))
            )}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalResults}
            />
          </div>
        </section>

        <aside className="grid content-start gap-3" aria-label="輔助資訊">
          <HotTagsCard tags={summary.topTags} />
          {recommended.length > 0 ? (
            <RecentRecommendationsCard recommended={recommended} />
          ) : null}
          <SourceMixCard summary={summary} />
          <PersonalCard />
        </aside>
      </div>
    </main>
  );
}
