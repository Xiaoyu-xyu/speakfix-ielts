"use client";

import { useState } from "react";
import type { PreHelpOutput } from "@/lib/ai";
import type { PracticeQuestion } from "@/types/practice";

type AssistTabsProps = {
  question: PracticeQuestion;
  preHelpOutput: PreHelpOutput;
  scrollIdBase?: string;
  onExpandedChange?: (scrollId?: string, helpType?: AssistId) => void;
};

type IconProps = {
  className?: string;
};

function TextIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 6h14M5 12h10M5 18h7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TranslateIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5h10M9 5v3M6 19l4-9 4 9M7.2 16h5.6M16 11h4M18 9v2c0 2.3-1.4 4-3 4M18 11c0 2.3 1.4 4 3 4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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

const assists = [
  { id: "original", label: "原文", icon: TextIcon, iconClass: "text-bamboo-700" },
  {
    id: "translation",
    label: "翻译",
    icon: TranslateIcon,
    iconClass: "text-bamboo-700",
  },
  { id: "idea", label: "思路", icon: BulbIcon, iconClass: "text-amber-500" },
] as const;

type AssistId = (typeof assists)[number]["id"];

export function AssistTabs({
  question,
  preHelpOutput,
  scrollIdBase,
  onExpandedChange,
}: AssistTabsProps) {
  const [activeAssist, setActiveAssist] = useState<AssistId | null>(null);

  function toggleAssist(assistId: AssistId) {
    const nextAssist = activeAssist === assistId ? null : assistId;

    setActiveAssist(nextAssist);
    onExpandedChange?.(
      nextAssist && scrollIdBase ? `${scrollIdBase}-${nextAssist}` : undefined,
      nextAssist ?? undefined,
    );
  }

  return (
    <section className="-mt-2 rounded-b-[22px] bg-bamboo-50 px-4 pb-2 pt-0">
      <div className="flex items-center gap-1.5">
        {assists.map((assist) => {
          const Icon = assist.icon;
          const isActive = activeAssist === assist.id;
          const isIdea = assist.id === "idea";

          return (
            <button
              key={assist.id}
              type="button"
              aria-label={assist.label}
              onClick={() => toggleAssist(assist.id)}
              className={`flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold transition ${
                isActive
                  ? "bg-white text-bamboo-700 shadow-sm"
                  : "text-slate-500 hover:bg-white/70 hover:text-bamboo-700"
              }`}
            >
              <Icon className={`h-4 w-4 ${assist.iconClass}`} />
              {isIdea && <span>{"\u601d\u8def"}</span>}
            </button>
          );
        })}
      </div>

      {activeAssist && (
        <div
          className="relative mt-1 rounded-xl bg-white/80 px-3 py-2 pr-14 text-sm leading-6 text-slate-700"
          data-scroll-id={
            scrollIdBase ? `${scrollIdBase}-${activeAssist}` : undefined
          }
        >
          <button
            type="button"
            onClick={() => toggleAssist(activeAssist)}
            className="absolute right-3 top-2 text-xs font-semibold text-slate-400"
          >
            收起 ∧
          </button>
          {activeAssist === "original" && <p>{question.text}</p>}
          {activeAssist === "translation" && <p>{question.translation}</p>}
          {activeAssist === "idea" && (
            <div className="space-y-3">
              <p>{preHelpOutput.answer_direction_zh}</p>
              <div className="flex flex-wrap gap-2">
                {preHelpOutput.useful_keywords_en.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-bamboo-700"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
              <p className="rounded-xl bg-white px-3 py-2 text-bamboo-700">
                {"\u77ed\u53e5\u652f\u67b6\uff1a"}{preHelpOutput.sentence_starter_en}
              </p>
              {preHelpOutput.caution_zh && (
                <p className="text-xs font-semibold text-slate-500">
                  {"\u63d0\u9192\uff1a"}{preHelpOutput.caution_zh}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
