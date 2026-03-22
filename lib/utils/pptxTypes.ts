export interface PptxTheme {
  background: string;
  titleColor: string;
  textColor: string;
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
  bullets: string[];
}

export interface TwoColumnSlide {
  layout: "two-column";
  title: string;
  left: string[];
  right: string[];
}

export interface StatSlide {
  layout: "stat";
  title: string;
  value: string;
  description?: string;
}

export type SlideData = TitleSlide | ContentSlide | TwoColumnSlide | StatSlide;

export interface PptxData {
  title: string;
  theme?: Partial<PptxTheme>;
  slides: SlideData[];
}
