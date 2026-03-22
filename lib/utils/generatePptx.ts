import type { PptxData, PptxTheme, SlideData } from "./pptxTypes";

const DEFAULT_THEME: PptxTheme = {
  background: "1a1a2e",
  titleColor: "FFFFFF",
  textColor: "E0E0E0",
  accentColor: "6C63FF",
};

export async function generatePptxBlob(data: PptxData): Promise<Blob> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  const theme = { ...DEFAULT_THEME, ...data.theme };

  pptx.layout = "LAYOUT_WIDE";
  pptx.title = data.title;

  for (const slide of data.slides) {
    const s = pptx.addSlide();
    s.background = { color: theme.background };
    renderSlide(s, slide, theme);
  }

  const blob = await (pptx as unknown as { write: (opts: { outputType: string }) => Promise<Blob> }).write({ outputType: "blob" });
  return blob as Blob;
}

function renderSlide(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slide: any,
  data: SlideData,
  theme: PptxTheme,
) {
  switch (data.layout) {
    case "title":
      slide.addText(data.title, {
        x: 0.8, y: 1.8, w: "85%", fontSize: 36, bold: true,
        color: theme.titleColor, align: "center",
      });
      if (data.subtitle) {
        slide.addText(data.subtitle, {
          x: 0.8, y: 3.2, w: "85%", fontSize: 18,
          color: theme.textColor, align: "center",
        });
      }
      break;

    case "content":
      slide.addText(data.title, {
        x: 0.6, y: 0.4, w: "90%", fontSize: 24, bold: true,
        color: theme.titleColor,
      });
      slide.addText(
        data.bullets.map((b) => ({
          text: b,
          options: { bullet: true, fontSize: 16, color: theme.textColor, breakLine: true },
        })),
        { x: 0.8, y: 1.4, w: "85%", lineSpacing: 28 },
      );
      break;

    case "two-column":
      slide.addText(data.title, {
        x: 0.6, y: 0.4, w: "90%", fontSize: 24, bold: true,
        color: theme.titleColor,
      });
      slide.addText(
        data.left.map((b) => ({
          text: b,
          options: { bullet: true, fontSize: 14, color: theme.textColor, breakLine: true },
        })),
        { x: 0.6, y: 1.4, w: "45%", lineSpacing: 24 },
      );
      slide.addText(
        data.right.map((b) => ({
          text: b,
          options: { bullet: true, fontSize: 14, color: theme.textColor, breakLine: true },
        })),
        { x: 6.4, y: 1.4, w: "45%", lineSpacing: 24 },
      );
      break;

    case "stat":
      slide.addText(data.title, {
        x: 0.6, y: 0.6, w: "90%", fontSize: 20, bold: true,
        color: theme.titleColor,
      });
      slide.addText(data.value, {
        x: 0.6, y: 2.0, w: "90%", fontSize: 60, bold: true,
        color: theme.accentColor, align: "center",
      });
      if (data.description) {
        slide.addText(data.description, {
          x: 0.6, y: 3.8, w: "90%", fontSize: 16,
          color: theme.textColor, align: "center",
        });
      }
      break;
  }
}
