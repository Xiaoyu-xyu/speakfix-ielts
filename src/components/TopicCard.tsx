import Link from "next/link";
import type { Topic } from "@/types/practice";

type TopicCardProps = {
  preserveDebug?: boolean;
  topic: Topic;
};

export function TopicCard({ preserveDebug = false, topic }: TopicCardProps) {
  const href = preserveDebug ? `/practice/${topic.id}?debug=1` : `/practice/${topic.id}`;

  return (
    <Link
      href={href}
      className="block rounded-[22px] border border-bamboo-100 bg-white p-4 shadow-soft transition active:scale-[0.99]"
    >
      <h2 className="text-base font-semibold text-ink">{topic.title}</h2>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
        {topic.questions[0]?.text}
      </p>
    </Link>
  );
}
