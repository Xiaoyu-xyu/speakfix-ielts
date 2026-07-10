export type TopicCategory = "people" | "objects" | "events" | "places";

export type PracticeStatus =
  | "idle"
  | "asking"
  | "readyToAnswer"
  | "recording"
  | "answered"
  | "polishExpanded"
  | "retryRecording"
  | "nextQuestion"
  | "completed";

export type PreHelp = {
  cnDirection: string;
  keywords: string[];
};

export type AnswerStructureType =
  | "basic_fact"
  | "preference_reason"
  | "yes_no_reason"
  | "frequency_situation"
  | "type_reason"
  | "past_present_compare"
  | "place_description"
  | "experience_example"
  | "opinion_reason"
  | "choice_compare";

export type PracticeQuestion = {
  id: string;
  text: string;
  answerStructureType: AnswerStructureType;
  translation: string;
  preHelp: PreHelp;
};

export type Topic = {
  id: string;
  category: TopicCategory;
  title: string;
  tag: string;
  difficulty: "无难度" | "低难度" | "中难度" | "高难度";
  questions: PracticeQuestion[];
};
