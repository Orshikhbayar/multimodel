export interface PptxTheme {
  background: string;
  titleColor: string;
  bodyColor: string;
  accentColor: string;
}

export interface TitleSlide {
  layout: "title";
  title: string;
  subtitle?: string;
}

export interface ContentSlide {
  layout: "content";
  title: string;
  body: string[];
  notes?: string;
}

export interface TwoColumnSlide {
  layout: "two-column";
  title: string;
  left: { heading: string; points: string[] };
  right: { heading: string; points: string[] };
  notes?: string;
}

export interface StatSlide {
  layout: "stat";
  title: string;
  stats: Array<{ value: string; label: string }>;
  notes?: string;
}

export type Slide = TitleSlide | ContentSlide | TwoColumnSlide | StatSlide;

export interface PptxData {
  title: string;
  theme: PptxTheme;
  slides: Slide[];
}
