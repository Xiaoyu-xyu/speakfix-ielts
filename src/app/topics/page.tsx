"use client";

import { useMemo, useState } from "react";
import { TopicCard } from "@/components/TopicCard";
import { recommendedTopics, topics } from "@/data/topics";
import type { TopicCategory } from "@/types/practice";

const sections: Array<{
  id: "recommended" | TopicCategory;
  label: string;
}> = [
  { id: "recommended", label: "推荐练习" },
  { id: "people", label: "人物" },
  { id: "objects", label: "事物" },
  { id: "events", label: "事件" },
  { id: "places", label: "地点" },
];

type SectionId = (typeof sections)[number]["id"];

export default function TopicsPage() {
  const [activeSection, setActiveSection] = useState<SectionId>("recommended");

  const visibleTopics = useMemo(() => {
    if (activeSection === "recommended") {
      return recommendedTopics;
    }

    return topics.filter((topic) => topic.category === activeSection);
  }, [activeSection]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] px-5 py-6">
      <header>
        <p className="text-sm font-bold text-bamboo-700">SpeakFix IELTS</p>
        <h1 className="mt-3 text-2xl font-bold text-ink">
          选择一个 Part 1 话题
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          每个话题包含 3 道小题，完成后即可结束一轮短练习。
        </p>
      </header>

      <section className="mt-6 flex gap-2 overflow-x-auto pb-2">
        {sections.map((section) => {
          const isActive = activeSection === section.id;

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                isActive
                  ? "border-bamboo-500 bg-bamboo-600 text-white shadow-soft"
                  : "border-bamboo-100 bg-white text-bamboo-700"
              }`}
            >
              {section.label}
            </button>
          );
        })}
      </section>

      <section className="mt-5 pb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">
            {sections.find((section) => section.id === activeSection)?.label}
          </h2>
          <span className="text-xs font-semibold text-slate-500">
            {visibleTopics.length} 个话题
          </span>
        </div>
        <div className="grid gap-3">
          {visibleTopics.map((topic) => (
            <TopicCard key={topic.id} topic={topic} />
          ))}
        </div>
      </section>
    </main>
  );
}
