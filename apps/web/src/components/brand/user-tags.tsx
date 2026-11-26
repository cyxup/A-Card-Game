import type { UserTagView } from "@stacked/shared";
import { cn } from "@/lib/utils";

export function UserTags({
  tags,
  max = 3,
  className,
}: {
  tags?: UserTagView[] | null;
  max?: number;
  className?: string;
}) {
  if (!tags || tags.length === 0) return null;
  const shown = tags.slice(0, Math.max(0, max));
  const hidden = tags.length - shown.length;
  return (
    <span className={cn("inline-flex max-w-full flex-wrap items-center gap-1", className)}>
      {shown.map((tag) => (
        <span
          key={tag.id}
          title={tag.name}
          className="inline-flex max-w-[8rem] items-center truncate rounded-full border px-1.5 py-0 text-[9px] font-medium leading-4"
          style={{
            borderColor: `${tag.color}66`,
            backgroundColor: `${tag.color}14`,
            color: tag.color,
          }}
        >
          {tag.name}
        </span>
      ))}
      {hidden > 0 ? (
        <span className="text-[9px] font-medium text-muted-foreground">+{hidden}</span>
      ) : null}
    </span>
  );
}
