import {
  BarChart3,
  BookOpen,
  MessageSquare,
  Settings2,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react';

import { pickLocalized, type Locale } from '@/lib/locale';
import type { Messages } from '@/i18n';

type LocalizedField = unknown;

export interface DigestShape {
  tldr: LocalizedField;
  problemMotivation: LocalizedField;
  keyContributions: LocalizedField;
  methodOverview: LocalizedField;
  resultsInterpretation: LocalizedField;
  aiCommentary: LocalizedField;
}

type PaperDetailMessages = Messages['paperDetail'];

const DIGEST_SECTIONS: Array<{
  key: keyof DigestShape;
  titleKey: keyof PaperDetailMessages;
  Icon: LucideIcon;
  anchorId: string;
}> = [
  { key: 'tldr', titleKey: 'digestTldr', Icon: BookOpen, anchorId: 'digest-tldr' },
  {
    key: 'problemMotivation',
    titleKey: 'digestProblemMotivation',
    Icon: Target,
    anchorId: 'digest-problem',
  },
  {
    key: 'keyContributions',
    titleKey: 'digestKeyContributions',
    Icon: Sparkles,
    anchorId: 'digest-contributions',
  },
  {
    key: 'methodOverview',
    titleKey: 'digestMethodOverview',
    Icon: Settings2,
    anchorId: 'digest-method',
  },
  {
    key: 'resultsInterpretation',
    titleKey: 'digestResultsInterpretation',
    Icon: BarChart3,
    anchorId: 'digest-results',
  },
  {
    key: 'aiCommentary',
    titleKey: 'digestAiCommentary',
    Icon: MessageSquare,
    anchorId: 'digest-commentary',
  },
];

export function PaperDigest({
  digest,
  locale,
  messages,
}: {
  digest: DigestShape;
  locale: Locale;
  messages: Messages;
}) {
  return (
    <section id="digest" className="scroll-mt-[120px] space-y-4">
      <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#5848f5]">
        <Sparkles aria-hidden className="h-4 w-4" />
        {messages.paperDetail.aiDigest}
      </h2>
      <div className="space-y-4">
        {DIGEST_SECTIONS.map((sec) => {
          const titleValue = messages.paperDetail[sec.titleKey];
          if (typeof titleValue !== 'string') return null;
          return (
            <DigestCard
              key={sec.key}
              Icon={sec.Icon}
              anchorId={sec.anchorId}
              title={titleValue}
              value={digest[sec.key]}
              locale={locale}
            />
          );
        })}
      </div>
    </section>
  );
}

function DigestCard({
  Icon,
  anchorId,
  title,
  value,
  locale,
}: {
  Icon: LucideIcon;
  anchorId: string;
  title: string;
  value: LocalizedField;
  locale: Locale;
}) {
  const text = pickLocalized(value, locale);
  if (!text) return null;
  return (
    <article
      id={anchorId}
      className="scroll-mt-[120px] rounded-[10px] border border-[#e5e9f3] bg-white p-5 shadow-[0_18px_50px_rgba(31,42,68,0.08)]"
    >
      <header className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-[8px] bg-[#eef0ff] text-[#5b4df1]">
          <Icon aria-hidden className="h-4 w-4" />
        </span>
        <h3 className="text-[14px] font-bold text-[#111827]">{title}</h3>
      </header>
      <div className="mt-3">
        <MarkdownLite text={text} />
      </div>
    </article>
  );
}

// Minimal Markdown renderer for digest output.
// Supports: paragraphs (blank-line separated), numbered lists (`1. `), bullet lists (`- `),
// and inline **bold**. Anything else renders as plain text.
function MarkdownLite({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className="space-y-2 text-[14.5px] leading-relaxed text-[#1f2937]">
      {blocks.map((block, i) => (
        <MarkdownBlock key={i} block={block} />
      ))}
    </div>
  );
}

function MarkdownBlock({ block }: { block: string }) {
  const lines = block.split('\n').map((l) => l.trimEnd());
  const allNumbered = lines.length > 0 && lines.every((l) => /^\s*\d+\.\s+/.test(l));
  const allBullets = lines.length > 0 && lines.every((l) => /^\s*-\s+/.test(l));

  if (allNumbered) {
    return (
      <ol className="list-decimal space-y-1 pl-5">
        {lines.map((l, i) => (
          <li key={i}>
            <InlineMarkdown text={l.replace(/^\s*\d+\.\s+/, '')} />
          </li>
        ))}
      </ol>
    );
  }
  if (allBullets) {
    return (
      <ul className="list-disc space-y-1 pl-5">
        {lines.map((l, i) => (
          <li key={i}>
            <InlineMarkdown text={l.replace(/^\s*-\s+/, '')} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p>
      <InlineMarkdown text={lines.join(' ')} />
    </p>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i} className="font-bold text-[#111827]">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
