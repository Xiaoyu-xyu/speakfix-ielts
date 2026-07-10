import Link from "next/link";

type PracticeHeaderProps = {
  title: string;
  current: number;
  total: number;
  onRestart?: () => void;
};

export function PracticeHeader({
  title,
  current,
  total,
  onRestart,
}: PracticeHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-bamboo-100 bg-[#fbfdf8]/95 px-5 py-4 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[430px] items-center justify-between gap-3">
        <Link
          href="/topics"
          className="rounded-full border border-bamboo-100 bg-white px-3 py-2 text-sm font-semibold text-bamboo-700"
        >
          返回题库
        </Link>
        <div className="min-w-0 text-right">
          <p className="truncate text-sm font-semibold text-ink">{title}</p>
          <p className="text-xs text-slate-500">
            Question {current}/{total}
          </p>
        </div>
      </div>
      {onRestart && (
        <div className="mx-auto mt-3 flex w-full max-w-[430px] justify-end">
          <button
            type="button"
            onClick={onRestart}
            className="text-xs font-semibold text-bamboo-700"
          >
            重新开始本话题
          </button>
        </div>
      )}
    </header>
  );
}
