import { normalizeLocale, type SupportedLocale } from "./locale";

export interface QuickStartPrompt {
  label: string;
  prompt: string;
}

export interface ComposerCopy {
  quickStartLabel: string;
  quickStartPrompts: QuickStartPrompt[];
  placeholder: string;
  stopGenerating: string;
  send: string;
  shortcutsHint: string;
  estimatedCostLabel: string;
  modelSingular: string;
  modelPlural: string;
  estimateAppearsHint: string;
}

const EN_QUICK_START_PROMPTS: QuickStartPrompt[] = [
  {
    label: "Debug bug",
    prompt:
      "Debug this issue step by step. Start by listing likely root causes, then propose the fastest fix and tests.",
  },
  {
    label: "Refactor code",
    prompt:
      "Refactor this code for readability and maintainability without changing behavior. Explain key tradeoffs.",
  },
  {
    label: "Landing page copy",
    prompt:
      "Write high-converting landing page copy with headline, subheadline, benefits, CTA, and social proof.",
  },
  {
    label: "Campaign brief",
    prompt:
      "Create a campaign brief with target audience, value prop, channels, core messages, and success metrics.",
  },
  {
    label: "A/B test ideas",
    prompt:
      "Generate 10 practical A/B test ideas for conversion uplift, with hypothesis, metric, and expected impact.",
  },
];

const MN_QUICK_START_PROMPTS: QuickStartPrompt[] = [
  {
    label: "Алдаа засах",
    prompt:
      "Энэ асуудлыг алхам алхмаар алдаа оношил. Эхлээд боломжит шалтгаануудыг жагсаагаад, дараа нь хамгийн хурдан засвар болон тестүүдийг санал болго.",
  },
  {
    label: "Код сайжруулах",
    prompt:
      "Кодын одоогийн үйлдлийг өөрчлөхгүйгээр уншихад ойлгомжтой, арчлахад хялбар байдлаар refactor хий. Гол trade-off-уудыг тайлбарла.",
  },
  {
    label: "Landing page copy",
    prompt:
      "Өндөр хөрвөлттэй landing page copy бич. Гарчиг, дэд гарчиг, давуу талууд, CTA, social proof-ийг тусга.",
  },
  {
    label: "Campaign brief",
    prompt:
      "Зорилтот хэрэглэгч, үнэ цэнийн санал, сувгууд, гол мессежүүд, амжилтын хэмжүүрүүдтэй campaign brief бэлд.",
  },
  {
    label: "A/B test санаа",
    prompt:
      "Хөрвөлт нэмэгдүүлэх 10 практик A/B test санаа гарга. Санаа бүрт таамаглал, хэмжүүр, хүлээгдэж буй нөлөөг оруул.",
  },
];

const COMPOSER_COPY: Record<SupportedLocale, ComposerCopy> = {
  en: {
    quickStartLabel: "Quick start:",
    quickStartPrompts: EN_QUICK_START_PROMPTS,
    placeholder: "Message the team…",
    stopGenerating: "Stop generating",
    send: "Send",
    shortcutsHint: "Shift+Enter for newline · Cmd/Ctrl+Enter to send",
    estimatedCostLabel: "Est. cost:",
    modelSingular: "model",
    modelPlural: "models",
    estimateAppearsHint: "Estimate appears as you type",
  },
  mn: {
    quickStartLabel: "Эхлэх санаа:",
    quickStartPrompts: MN_QUICK_START_PROMPTS,
    placeholder: "Багтаа мессеж бичих…",
    stopGenerating: "Үүсгэхийг зогсоох",
    send: "Илгээх",
    shortcutsHint: "Shift+Enter шинэ мөр · Cmd/Ctrl+Enter илгээх",
    estimatedCostLabel: "Тооцоолсон үнэ:",
    modelSingular: "загвар",
    modelPlural: "загвар",
    estimateAppearsHint: "Бичих үед тооцоо харагдана",
  },
};

export function getComposerCopy(locale: string): ComposerCopy {
  return COMPOSER_COPY[normalizeLocale(locale)];
}
