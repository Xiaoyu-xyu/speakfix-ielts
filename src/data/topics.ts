import type { Topic, TopicCategory } from "@/types/practice";

export const categoryLabels: Record<TopicCategory, string> = {
  people: "人物",
  objects: "事物",
  events: "事件",
  places: "地点",
};

export const recommendedTopicIds = [
  "personal-information",
  "clothes",
  "place-of-study",
  "outer-space-and-stars",
];

export const topics: Topic[] = [
  {
    id: "personal-information",
    category: "people",
    title: "Personal information",
    tag: "来自人物",
    difficulty: "无难度",
    questions: [
      {
        id: "personal-information-1",
        text: "How old are you?",
        answerStructureType: "basic_fact",
        translation: "你多大了？",
        preHelp: {
          cnDirection: "直接说明年龄，也可以补充目前所处的人生阶段。",
          keywords: ["years old", "student", "now", "currently"],
        },
      },
      {
        id: "personal-information-2",
        text: "Where do you live?",
        answerStructureType: "basic_fact",
        translation: "你住在哪里？",
        preHelp: {
          cnDirection: "说明居住城市或区域，再简单说居住时间。",
          keywords: ["live in", "city", "area", "for years"],
        },
      },
      {
        id: "personal-information-3",
        text: "What kind of place is it?",
        answerStructureType: "place_description",
        translation: "那是一个什么样的地方？",
        preHelp: {
          cnDirection: "描述环境特点，例如安静、方便、热闹或适合生活。",
          keywords: ["quiet", "convenient", "busy", "comfortable"],
        },
      },
    ],
  },
  {
    id: "work-or-study",
    category: "people",
    title: "Work or Study",
    tag: "人物",
    difficulty: "低难度",
    questions: [
      {
        id: "work-or-study-1",
        text: "What do you do?",
        answerStructureType: "basic_fact",
        translation: "你是做什么的？",
        preHelp: {
          cnDirection: "说明自己是学生或工作者，再说专业或岗位。",
          keywords: ["student", "work as", "major", "job"],
        },
      },
      {
        id: "work-or-study-2",
        text: "Do you enjoy your job/studies?",
        answerStructureType: "yes_no_reason",
        translation: "你喜欢你的工作或学习吗？",
        preHelp: {
          cnDirection: "先回答喜欢程度，再给一个简单原因。",
          keywords: ["enjoy", "interesting", "useful", "sometimes"],
        },
      },
      {
        id: "work-or-study-3",
        text: "What are the advantages of your job/field of study?",
        answerStructureType: "opinion_reason",
        translation: "你的工作或学习领域有什么优点？",
        preHelp: {
          cnDirection: "说一个优势，例如实用、发展机会或能学到新东西。",
          keywords: ["advantage", "learn", "future", "skills"],
        },
      },
    ],
  },
  {
    id: "teachers",
    category: "people",
    title: "Teachers",
    tag: "人物",
    difficulty: "中难度",
    questions: [
      {
        id: "teachers-1",
        text: "Do you have a favorite teacher?",
        answerStructureType: "yes_no_reason",
        translation: "你有最喜欢的老师吗？",
        preHelp: {
          cnDirection: "说明是否有，再说这个老师的一个特点。",
          keywords: ["favorite teacher", "patient", "kind", "clear"],
        },
      },
      {
        id: "teachers-2",
        text: "Do you want to be a teacher in the future?",
        answerStructureType: "yes_no_reason",
        translation: "你将来想当老师吗？",
        preHelp: {
          cnDirection: "表达意愿，再说原因或顾虑。",
          keywords: ["in the future", "teach", "children", "responsibility"],
        },
      },
      {
        id: "teachers-3",
        text: "Do you have a teacher from your past that you still remember?",
        answerStructureType: "experience_example",
        translation: "你还记得过去的一位老师吗？",
        preHelp: {
          cnDirection: "说是否记得，再补充这位老师让你印象深的原因。",
          keywords: ["remember", "primary school", "helped me", "impressive"],
        },
      },
    ],
  },
  {
    id: "clothes",
    category: "objects",
    title: "Clothes",
    tag: "来自事物",
    difficulty: "低难度",
    questions: [
      {
        id: "clothes-1",
        text: "What kind of clothes do you like to wear?",
        answerStructureType: "type_reason",
        translation: "你喜欢穿什么样的衣服？",
        preHelp: {
          cnDirection: "说出衣服风格，再说明舒适或场景原因。",
          keywords: ["casual", "comfortable", "simple", "daily"],
        },
      },
      {
        id: "clothes-2",
        text: "Do you prefer to wear comfortable and casual clothes or formal clothes?",
        answerStructureType: "choice_compare",
        translation: "你更喜欢穿舒适休闲的衣服还是正式衣服？",
        preHelp: {
          cnDirection: "明确偏好，再说明日常使用频率或场合。",
          keywords: ["prefer", "casual clothes", "formal clothes", "occasion"],
        },
      },
      {
        id: "clothes-3",
        text: "Do you like wearing T-shirts?",
        answerStructureType: "yes_no_reason",
        translation: "你喜欢穿 T 恤吗？",
        preHelp: {
          cnDirection: "回答喜好，再说 T 恤是否方便搭配。",
          keywords: ["T-shirts", "easy", "summer", "match"],
        },
      },
    ],
  },
  {
    id: "website",
    category: "objects",
    title: "Website",
    tag: "事物",
    difficulty: "中难度",
    questions: [
      {
        id: "website-1",
        text: "What kinds of websites do you often visit?",
        answerStructureType: "type_reason",
        translation: "你经常访问什么类型的网站？",
        preHelp: {
          cnDirection: "列出一两类网站，例如学习、新闻、视频或购物。",
          keywords: ["websites", "study", "news", "videos"],
        },
      },
      {
        id: "website-2",
        text: "What is your favourite website?",
        answerStructureType: "preference_reason",
        translation: "你最喜欢的网站是什么？",
        preHelp: {
          cnDirection: "说出网站类型或名称，再说喜欢的原因。",
          keywords: ["favorite", "useful", "information", "easy to use"],
        },
      },
      {
        id: "website-3",
        text: "Do you prefer getting information from websites or books?",
        answerStructureType: "choice_compare",
        translation: "你更喜欢从网站还是书本获取信息？",
        preHelp: {
          cnDirection: "说明偏好，比较速度、可信度或便利性。",
          keywords: ["prefer", "websites", "books", "quick"],
        },
      },
    ],
  },
  {
    id: "headphones",
    category: "objects",
    title: "Headphones",
    tag: "事物",
    difficulty: "低难度",
    questions: [
      {
        id: "headphones-1",
        text: "Do you use headphones?",
        answerStructureType: "yes_no_reason",
        translation: "你使用耳机吗？",
        preHelp: {
          cnDirection: "直接回答是否使用，再说常见使用场景。",
          keywords: ["headphones", "music", "calls", "study"],
        },
      },
      {
        id: "headphones-2",
        text: "How often do you wear headphones?",
        answerStructureType: "frequency_situation",
        translation: "你多久戴一次耳机？",
        preHelp: {
          cnDirection: "回答频率，再说一天中的使用时间。",
          keywords: ["every day", "often", "on the bus", "at home"],
        },
      },
      {
        id: "headphones-3",
        text: "Do you think headphones are useful?",
        answerStructureType: "opinion_reason",
        translation: "你觉得耳机有用吗？",
        preHelp: {
          cnDirection: "表达看法，再说一个具体用途。",
          keywords: ["useful", "focus", "listen", "private"],
        },
      },
    ],
  },
  {
    id: "shopping",
    category: "events",
    title: "Shopping",
    tag: "事件",
    difficulty: "低难度",
    questions: [
      {
        id: "shopping-1",
        text: "Do you like shopping?",
        answerStructureType: "yes_no_reason",
        translation: "你喜欢购物吗？",
        preHelp: {
          cnDirection: "回答喜欢程度，再说购物是否让你放松。",
          keywords: ["shopping", "like", "relaxing", "sometimes"],
        },
      },
      {
        id: "shopping-2",
        text: "How often do you go shopping?",
        answerStructureType: "frequency_situation",
        translation: "你多久购物一次？",
        preHelp: {
          cnDirection: "说明频率，再说通常买什么。",
          keywords: ["once a week", "online", "clothes", "food"],
        },
      },
      {
        id: "shopping-3",
        text: "Do you prefer online shopping or in-store shopping?",
        answerStructureType: "choice_compare",
        translation: "你更喜欢网购还是线下购物？",
        preHelp: {
          cnDirection: "说明偏好，比较方便性或真实体验。",
          keywords: ["online shopping", "in-store", "convenient", "try"],
        },
      },
    ],
  },
  {
    id: "social-media",
    category: "events",
    title: "Social media",
    tag: "事件",
    difficulty: "中难度",
    questions: [
      {
        id: "social-media-1",
        text: "Have you ever posted anything on social media?",
        answerStructureType: "experience_example",
        translation: "你曾经在社交媒体上发布过内容吗？",
        preHelp: {
          cnDirection: "回答是否发布过，再说内容类型。",
          keywords: ["posted", "social media", "photos", "daily life"],
        },
      },
      {
        id: "social-media-2",
        text: "When did you start using social media?",
        answerStructureType: "basic_fact",
        translation: "你什么时候开始使用社交媒体？",
        preHelp: {
          cnDirection: "说大概时间，再补充当时为什么开始使用。",
          keywords: ["started", "middle school", "friends", "communicate"],
        },
      },
      {
        id: "social-media-3",
        text: "Do you think you spend too much time on social media?",
        answerStructureType: "opinion_reason",
        translation: "你觉得自己在社交媒体上花太多时间了吗？",
        preHelp: {
          cnDirection: "表达同意或不同意，再说对注意力或休息的影响。",
          keywords: ["too much time", "scroll", "focus", "limit"],
        },
      },
    ],
  },
  {
    id: "outer-space-and-stars",
    category: "events",
    title: "Outer space and stars",
    tag: "来自事件",
    difficulty: "高难度",
    questions: [
      {
        id: "outer-space-and-stars-1",
        text: "Have you ever learnt about outer space and stars?",
        answerStructureType: "experience_example",
        translation: "你曾经了解过外太空和星星吗？",
        preHelp: {
          cnDirection: "说明是否了解过，再说来源，例如课程、纪录片或新闻。",
          keywords: ["outer space", "stars", "learnt", "documentary"],
        },
      },
      {
        id: "outer-space-and-stars-2",
        text: "Do you enjoy watching science-fiction films/movies set in space?",
        answerStructureType: "yes_no_reason",
        translation: "你喜欢看太空题材的科幻电影吗？",
        preHelp: {
          cnDirection: "说明是否喜欢，再说画面、故事或想象力。",
          keywords: ["science-fiction", "space", "films", "imagination"],
        },
      },
      {
        id: "outer-space-and-stars-3",
        text: "Do you want to know more about outer space?",
        answerStructureType: "yes_no_reason",
        translation: "你想更多了解外太空吗？",
        preHelp: {
          cnDirection: "表达兴趣，再说想了解的方面。",
          keywords: ["know more", "planets", "universe", "curious"],
        },
      },
    ],
  },
  {
    id: "hometown",
    category: "places",
    title: "Hometown",
    tag: "地点",
    difficulty: "低难度",
    questions: [
      {
        id: "hometown-1",
        text: "Where is your hometown? Is that a big city or a small place?",
        answerStructureType: "preference_reason",
        translation: "你的家乡在哪里？那是大城市还是小地方？",
        preHelp: {
          cnDirection: "说出家乡位置，再说明城市规模。",
          keywords: ["hometown", "big city", "small place", "located"],
        },
      },
      {
        id: "hometown-2",
        text: "How long have you lived there?",
        answerStructureType: "basic_fact",
        translation: "你在那里住了多久？",
        preHelp: {
          cnDirection: "说明居住时长，也可以说是否一直住在那里。",
          keywords: ["lived there", "since childhood", "for years", "moved"],
        },
      },
      {
        id: "hometown-3",
        text: "What do you like the most about your hometown?",
        answerStructureType: "preference_reason",
        translation: "你最喜欢家乡的什么？",
        preHelp: {
          cnDirection: "说一个最喜欢的点，例如食物、人或生活节奏。",
          keywords: ["like most", "food", "people", "relaxed"],
        },
      },
    ],
  },
  {
    id: "parks",
    category: "places",
    title: "Parks",
    tag: "地点",
    difficulty: "低难度",
    questions: [
      {
        id: "parks-1",
        text: "Did you like going to parks as a child?",
        answerStructureType: "past_present_compare",
        translation: "你小时候喜欢去公园吗？",
        preHelp: {
          cnDirection: "回忆小时候是否喜欢，再说常做的活动。",
          keywords: ["as a child", "parks", "play", "weekends"],
        },
      },
      {
        id: "parks-2",
        text: "Do you still like going to parks now?",
        answerStructureType: "past_present_compare",
        translation: "你现在还喜欢去公园吗？",
        preHelp: {
          cnDirection: "说明现在是否还喜欢，再说现在去公园的目的。",
          keywords: ["still like", "walk", "fresh air", "relax"],
        },
      },
      {
        id: "parks-3",
        text: "Would you like to see more parks in your city?",
        answerStructureType: "opinion_reason",
        translation: "你希望你的城市有更多公园吗？",
        preHelp: {
          cnDirection: "表达希望或不希望，再说对城市生活的影响。",
          keywords: ["more parks", "city", "green space", "healthy"],
        },
      },
    ],
  },
  {
    id: "place-of-study",
    category: "places",
    title: "Place of study",
    tag: "来自地点",
    difficulty: "中难度",
    questions: [
      {
        id: "place-of-study-1",
        text: "Do you prefer to study at home or in a library?",
        answerStructureType: "choice_compare",
        translation: "你更喜欢在家学习还是在图书馆学习？",
        preHelp: {
          cnDirection: "说明偏好，再比较安静程度或便利性。",
          keywords: ["study at home", "library", "quiet", "focus"],
        },
      },
      {
        id: "place-of-study-2",
        text: "What is your favorite place to study?",
        answerStructureType: "preference_reason",
        translation: "你最喜欢的学习地点是哪里？",
        preHelp: {
          cnDirection: "说一个具体地点，再说它适合学习的原因。",
          keywords: ["favorite place", "desk", "library", "comfortable"],
        },
      },
      {
        id: "place-of-study-3",
        text: "What part of your school do you like the most?",
        answerStructureType: "place_description",
        translation: "你最喜欢学校的哪个部分？",
        preHelp: {
          cnDirection: "说学校里的一个区域，再说明喜欢的原因。",
          keywords: ["school", "classroom", "library", "campus"],
        },
      },
    ],
  },
];

export const recommendedTopics = recommendedTopicIds
  .map((topicId) => topics.find((topic) => topic.id === topicId))
  .filter((topic): topic is Topic => Boolean(topic));

export function getTopicById(topicId: string) {
  return topics.find((topic) => topic.id === topicId);
}
