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

const SECTION_LABEL = 'text-[11px] font-bold uppercase tracking-[0.08em] text-[#5848f5]';
const SUBSECTION_LABEL =
  'text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#475467]';
const CARD =
  'rounded-2xl border border-[#e5e9f3] bg-white p-5 shadow-[0_12px_32px_rgba(24,34,64,0.055)]';

export function PaperDigest({
  digest,
  locale,
  messages,
}: {
  digest: DigestShape;
  locale: Locale;
  messages: Messages;
}) {
  const t = messages.paperDetail;
  return (
    <section className={CARD}>
      <h2 className={SECTION_LABEL}>{t.aiDigest}</h2>
      <div className="mt-4 space-y-5">
        <DigestBlock title={t.digestTldr} value={digest.tldr} locale={locale} />
        <DigestBlock
          title={t.digestProblemMotivation}
          value={digest.problemMotivation}
          locale={locale}
        />
        <DigestBlock
          title={t.digestKeyContributions}
          value={digest.keyContributions}
          locale={locale}
        />
        <DigestBlock
          title={t.digestMethodOverview}
          value={digest.methodOverview}
          locale={locale}
        />
        <DigestBlock
          title={t.digestResultsInterpretation}
          value={digest.resultsInterpretation}
          locale={locale}
        />
        <DigestBlock
          title={t.digestAiCommentary}
          value={digest.aiCommentary}
          locale={locale}
        />
      </div>
    </section>
  );
}

function DigestBlock({
  title,
  value,
  locale,
}: {
  title: string;
  value: LocalizedField;
  locale: Locale;
}) {
  const text = pickLocalized(value, locale);
  if (!text) return null;
  return (
    <div>
      <h3 className={SUBSECTION_LABEL}>{title}</h3>
      <div className="mt-1.5">
        <MarkdownLite text={text} />
      </div>
    </div>
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
