import Link from "next/link";

type IconProps = {
  className?: string;
};

function BulbIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 18h6M10 22h4M8.5 14.5c-1.3-1-2-2.5-2-4.1A5.5 5.5 0 0 1 12 5a5.5 5.5 0 0 1 5.5 5.4c0 1.6-.7 3.1-2 4.1-.8.6-1.2 1.4-1.3 2.5H9.8c-.1-1.1-.5-1.9-1.3-2.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WandIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m14 4 6 6M4 20 16.5 7.5M5 6V3M5 3H2M19 21v-3M19 18h3M12 3l1 2M3 12l2 1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RepeatIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M17 2.5 21 6l-4 3.5M3 11V9a3 3 0 0 1 3-3h15M7 21.5 3 18l4-3.5M21 13v2a3 3 0 0 1-3 3H3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const valuePoints = [
  { label: "答前有方向", icon: BulbIcon, iconClass: "text-amber-500" },
  { label: "答后润色拓展", icon: WandIcon, iconClass: "text-bamboo-600" },
  { label: "可选重说一次", icon: RepeatIcon, iconClass: "text-bamboo-600" },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-5 py-7">
      <section className="flex flex-1 flex-col">
        <div className="pt-6">
          <h1 className="text-[3.35rem] font-black uppercase leading-[0.9] tracking-[0.1em] text-bamboo-700">
            SPEAKFIX
            <span className="mt-2 block text-ink">IELTS</span>
          </h1>
          <p className="mt-7 text-2xl font-bold tracking-wide text-bamboo-700">
            AI雅思口语陪练
          </p>
          <p className="mt-4 max-w-[20rem] text-base leading-7 text-slate-600">
            让你的回答，更像<span className="font-bold text-bamboo-700">雅思口语</span>。
          </p>
        </div>

        <div className="mt-10 grid gap-3">
          {valuePoints.map((point) => {
            const Icon = point.icon;

            return (
              <div
                key={point.label}
                className="flex items-center gap-3 rounded-2xl border border-bamboo-100 bg-white/85 px-4 py-3 shadow-soft"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bamboo-50">
                  <Icon className={`h-5 w-5 ${point.iconClass}`} />
                </span>
                <p className="text-sm font-semibold text-ink">{point.label}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-auto flex flex-col items-center pb-3 pt-10">
          <Link
            href="/topics"
            className="flex h-20 w-20 items-center justify-center rounded-full bg-bamboo-600 text-white shadow-soft transition active:scale-95"
            aria-label="进入题库"
          >
            <ArrowIcon className="h-8 w-8" />
          </Link>
          <p className="mt-3 text-sm font-bold text-bamboo-700">进入题库</p>
        </div>
      </section>
    </main>
  );
}
