import PptxGenJS from "pptxgenjs";
import type { PptxData } from "./pptxTypes";

interface StyleConfig {
  headingFont: string;
  bodyFont: string;
  titleColor: string;
  bodyColor: string;
  accentColor: string;
}

export async function generateAndDownloadPptx(data: PptxData): Promise<void> {
  const pptx = new PptxGenJS();

  pptx.title = data.title;
  pptx.author = "MultiModel AI";
  pptx.layout = "LAYOUT_WIDE";

  const { background, titleColor, bodyColor, accentColor } = data.theme;

  const headingFont = "Trebuchet MS";
  const bodyFont = "Calibri";
  const style: StyleConfig = {
    headingFont,
    bodyFont,
    titleColor,
    bodyColor,
    accentColor,
  };

  for (const slideData of data.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: background };

    switch (slideData.layout) {
      case "title":
        renderTitleSlide(slide, slideData, style);
        break;
      case "content":
        renderContentSlide(slide, slideData, style);
        break;
      case "two-column":
        renderTwoColumnSlide(slide, slideData, style);
        break;
      case "stat":
        renderStatSlide(slide, slideData, style);
        break;
    }

    if ("notes" in slideData && slideData.notes) {
      slide.addNotes(slideData.notes);
    }
  }

  const fileName = `${data.title.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_")}.pptx`;
  await pptx.writeFile({ fileName });
}

function renderTitleSlide(
  slide: PptxGenJS.Slide,
  data: { title: string; subtitle?: string },
  style: StyleConfig,
) {
  slide.addText(data.title, {
    x: 0.8,
    y: 2.0,
    w: 11.7,
    h: 1.5,
    fontSize: 44,
    fontFace: style.headingFont,
    color: style.titleColor,
    bold: true,
    align: "center",
    valign: "bottom",
  });

  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: 0.8,
      y: 3.8,
      w: 11.7,
      h: 0.8,
      fontSize: 20,
      fontFace: style.bodyFont,
      color: style.bodyColor,
      align: "center",
      valign: "top",
    });
  }

  slide.addShape("rect", {
    x: 5.0,
    y: 3.5,
    w: 3.3,
    h: 0.06,
    fill: { color: style.accentColor },
  });
}

function renderContentSlide(
  slide: PptxGenJS.Slide,
  data: { title: string; body: string[] },
  style: StyleConfig,
) {
  slide.addText(data.title, {
    x: 0.8,
    y: 0.4,
    w: 11.7,
    h: 0.8,
    fontSize: 32,
    fontFace: style.headingFont,
    color: style.titleColor,
    bold: true,
  });

  const bulletItems = data.body.map((text) => ({
    text,
    options: {
      fontSize: 18,
      fontFace: style.bodyFont,
      color: style.bodyColor,
      bullet: { type: "bullet" as const, color: style.accentColor },
      paraSpaceBefore: 8,
      paraSpaceAfter: 8,
    },
  }));

  slide.addText(bulletItems, {
    x: 0.8,
    y: 1.5,
    w: 11.7,
    h: 5.0,
    valign: "top",
  });
}

function renderTwoColumnSlide(
  slide: PptxGenJS.Slide,
  data: {
    title: string;
    left: { heading: string; points: string[] };
    right: { heading: string; points: string[] };
  },
  style: StyleConfig,
) {
  slide.addText(data.title, {
    x: 0.8,
    y: 0.4,
    w: 11.7,
    h: 0.8,
    fontSize: 32,
    fontFace: style.headingFont,
    color: style.titleColor,
    bold: true,
  });

  slide.addText(data.left.heading, {
    x: 0.8,
    y: 1.6,
    w: 5.5,
    h: 0.6,
    fontSize: 22,
    fontFace: style.headingFont,
    color: style.accentColor,
    bold: true,
  });

  const leftItems = data.left.points.map((text) => ({
    text,
    options: {
      fontSize: 16,
      fontFace: style.bodyFont,
      color: style.bodyColor,
      bullet: { type: "bullet" as const, color: style.accentColor },
      paraSpaceBefore: 6,
      paraSpaceAfter: 6,
    },
  }));

  slide.addText(leftItems, {
    x: 0.8,
    y: 2.3,
    w: 5.5,
    h: 4.5,
    valign: "top",
  });

  slide.addText(data.right.heading, {
    x: 7.0,
    y: 1.6,
    w: 5.5,
    h: 0.6,
    fontSize: 22,
    fontFace: style.headingFont,
    color: style.accentColor,
    bold: true,
  });

  const rightItems = data.right.points.map((text) => ({
    text,
    options: {
      fontSize: 16,
      fontFace: style.bodyFont,
      color: style.bodyColor,
      bullet: { type: "bullet" as const, color: style.accentColor },
      paraSpaceBefore: 6,
      paraSpaceAfter: 6,
    },
  }));

  slide.addText(rightItems, {
    x: 7.0,
    y: 2.3,
    w: 5.5,
    h: 4.5,
    valign: "top",
  });

  slide.addShape("rect", {
    x: 6.45,
    y: 1.8,
    w: 0.03,
    h: 4.5,
    fill: { color: style.accentColor },
  });
}

function renderStatSlide(
  slide: PptxGenJS.Slide,
  data: { title: string; stats: Array<{ value: string; label: string }> },
  style: StyleConfig,
) {
  slide.addText(data.title, {
    x: 0.8,
    y: 0.4,
    w: 11.7,
    h: 0.8,
    fontSize: 32,
    fontFace: style.headingFont,
    color: style.titleColor,
    bold: true,
  });

  const statCount = data.stats.length;
  const totalWidth = 11.7;
  const statWidth = totalWidth / statCount;

  data.stats.forEach((stat, index) => {
    const xPos = 0.8 + index * statWidth;

    slide.addText(stat.value, {
      x: xPos,
      y: 2.2,
      w: statWidth - 0.3,
      h: 1.5,
      fontSize: 54,
      fontFace: style.headingFont,
      color: style.accentColor,
      bold: true,
      align: "center",
      valign: "bottom",
    });

    slide.addText(stat.label, {
      x: xPos,
      y: 3.9,
      w: statWidth - 0.3,
      h: 0.8,
      fontSize: 16,
      fontFace: style.bodyFont,
      color: style.bodyColor,
      align: "center",
      valign: "top",
    });
  });
}
