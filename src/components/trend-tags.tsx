import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { TagCount } from '@/server/repos/trends';
import type { Messages } from '@/i18n';

interface TrendTagsProps {
  tags: TagCount[];
  messages: Messages;
  cap?: number;
}

export function TrendTags({ tags, messages, cap = 12 }: TrendTagsProps) {
  if (tags.length === 0) {
    return <p className="text-muted-foreground text-sm">{messages.trendTags.empty}</p>;
  }
  const visible = tags.slice(0, cap);
  const hidden = tags.length - visible.length;
  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((t) => (
        <Link
          key={t.tag}
          href={`/library?tags=${encodeURIComponent(t.tag)}`}
          className="no-underline"
        >
          <Badge variant="secondary" className="cursor-pointer">
            {t.tag}
            <span className="text-muted-foreground ml-1.5 font-normal">{t.count}</span>
          </Badge>
        </Link>
      ))}
      {hidden > 0 ? <Badge variant="outline">{messages.trendTags.more(hidden)}</Badge> : null}
    </div>
  );
}
