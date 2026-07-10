import { notFound } from "next/navigation";
import { getTopicById, topics } from "@/data/topics";
import { PracticeRoom } from "./practice-room";

type PracticePageProps = {
  params: Promise<{
    topicId: string;
  }>;
};

export function generateStaticParams() {
  return topics.map((topic) => ({
    topicId: topic.id,
  }));
}

export default async function PracticePage({ params }: PracticePageProps) {
  const { topicId } = await params;
  const topic = getTopicById(topicId);

  if (!topic) {
    notFound();
  }

  return <PracticeRoom topic={topic} />;
}
