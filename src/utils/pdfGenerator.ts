import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { PdfExportRequest } from '../types/study.ts';

function sanitizePdfText(input: string): string {
  // Standard Helvetica WinAnsi encoding safely renders Latin-1 printable characters.
  return input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '*')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, ' ');
}

function wrapLines(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const clean = sanitizePdfText(text).replace(/\r\n/g, '\n');
  const paragraphs = clean.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }

    const words = trimmed.split(/\s+/);
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        if (current) {
          lines.push(current);
          current = '';
        }
        // Handle unusually long unbroken tokens
        if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (font.widthOfTextAtSize(chunk + ch, fontSize) > maxWidth) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    if (current) {
      lines.push(current);
    }
  }

  return lines;
}

export async function buildStudyNotesPdf(payload: PdfExportRequest): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612; // Letter width
  const pageHeight = 792; // Letter height
  const marginX = 52;
  const marginTop = 56;
  const marginBottom = 56;
  const contentWidth = pageWidth - marginX * 2;

  const inkDark = rgb(0.06, 0.09, 0.16);
  const inkMuted = rgb(0.35, 0.41, 0.5);
  const accentBlue = rgb(0.15, 0.39, 0.92);
  const borderLight = rgb(0.86, 0.89, 0.93);
  const bgBanner = rgb(0.96, 0.97, 0.99);

  let page: PDFPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let cursorY = pageHeight - marginTop;

  const ensureSpace = (requiredHeight: number) => {
    if (cursorY - requiredHeight < marginBottom) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      cursorY = pageHeight - marginTop;
    }
  };

  const drawWrappedBlock = (
    text: string,
    options: {
      font?: PDFFont;
      size?: number;
      lineHeight?: number;
      color?: ReturnType<typeof rgb>;
      indent?: number;
      bulletPrefix?: string;
      paragraphGap?: number;
    } = {}
  ) => {
    const font = options.font ?? fontRegular;
    const size = options.size ?? 10.5;
    const lineHeight = options.lineHeight ?? 15.5;
    const color = options.color ?? inkDark;
    const indent = options.indent ?? 0;
    const availWidth = contentWidth - indent;

    const lines = wrapLines(text, font, size, availWidth);
    for (let i = 0; i < lines.length; i++) {
      ensureSpace(lineHeight);
      const line = lines[i];
      if (i === 0 && options.bulletPrefix) {
        page.drawText(sanitizePdfText(options.bulletPrefix), {
          x: marginX + indent - 12,
          y: cursorY,
          size,
          font: fontBold,
          color: accentBlue,
        });
      }
      if (line.length > 0) {
        page.drawText(line, {
          x: marginX + indent,
          y: cursorY,
          size,
          font,
          color,
        });
      }
      cursorY -= lineHeight;
    }
    if (options.paragraphGap) {
      cursorY -= options.paragraphGap;
    }
  };

  const drawSectionHeading = (title: string) => {
    ensureSpace(34);
    cursorY -= 8;
    page.drawText(sanitizePdfText(title), {
      x: marginX,
      y: cursorY,
      size: 12.5,
      font: fontBold,
      color: inkDark,
    });
    cursorY -= 7;
    page.drawLine({
      start: { x: marginX, y: cursorY },
      end: { x: pageWidth - marginX, y: cursorY },
      thickness: 0.75,
      color: borderLight,
    });
    cursorY -= 14;
  };

  // Top Header Box
  const bannerHeight = 58;
  page.drawRectangle({
    x: marginX,
    y: cursorY - bannerHeight + 14,
    width: contentWidth,
    height: bannerHeight,
    color: bgBanner,
    borderColor: borderLight,
    borderWidth: 0.75,
  });

  const subjectLine = `${payload.subjectCode ? `${payload.subjectCode} - ` : ''}${payload.subjectName}`;
  const weekLine = `Week ${payload.weekNumber}: ${payload.weekTitle}`;
  const statusLabel = payload.revisionReady ? 'Revision Ready' : 'Study Draft';

  page.drawText(sanitizePdfText(subjectLine), {
    x: marginX + 14,
    y: cursorY - 6,
    size: 10.5,
    font: fontBold,
    color: accentBlue,
  });

  page.drawText(sanitizePdfText(statusLabel), {
    x: pageWidth - marginX - 14 - fontBold.widthOfTextAtSize(statusLabel, 9),
    y: cursorY - 6,
    size: 9,
    font: fontBold,
    color: payload.revisionReady ? rgb(0.08, 0.5, 0.24) : inkMuted,
  });

  page.drawText(sanitizePdfText(weekLine), {
    x: marginX + 14,
    y: cursorY - 24,
    size: 9.5,
    font: fontRegular,
    color: inkMuted,
  });

  cursorY -= bannerHeight + 6;

  // Lecture Title
  drawWrappedBlock(payload.lectureTitle || 'Untitled Lecture', {
    font: fontBold,
    size: 19,
    lineHeight: 24,
    color: inkDark,
    paragraphGap: 6,
  });

  // Tags & Export Date metadata line
  const metaParts: string[] = [];
  if (payload.tags && payload.tags.length > 0) {
    metaParts.push(`Tags: ${payload.tags.join(', ')}`);
  }
  metaParts.push(`Exported ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`);

  drawWrappedBlock(metaParts.join('  |  '), {
    font: fontRegular,
    size: 9,
    lineHeight: 13,
    color: inkMuted,
    paragraphGap: 10,
  });

  // Summary Section
  drawSectionHeading('Executive Summary');
  drawWrappedBlock(payload.notesSummary || 'No summary generated yet.', {
    size: 10.5,
    lineHeight: 15.5,
    paragraphGap: 8,
  });

  // Bullet Points Section
  if (payload.notesBullets && payload.notesBullets.length > 0) {
    drawSectionHeading('Key Study Points');
    for (const bullet of payload.notesBullets) {
      drawWrappedBlock(bullet, {
        size: 10.5,
        lineHeight: 15,
        indent: 14,
        bulletPrefix: '-',
        paragraphGap: 4,
      });
    }
  }

  // Definitions Section
  if (payload.notesDefinitions && payload.notesDefinitions.length > 0) {
    drawSectionHeading('Core Definitions');
    for (const def of payload.notesDefinitions) {
      ensureSpace(26);
      drawWrappedBlock(def.term, {
        font: fontBold,
        size: 10.5,
        lineHeight: 14.5,
        color: inkDark,
      });
      drawWrappedBlock(def.definition, {
        font: fontRegular,
        size: 10,
        lineHeight: 14.5,
        color: inkMuted,
        indent: 10,
        paragraphGap: 6,
      });
    }
  }

  // Examples Section
  if (payload.notesExamples && payload.notesExamples.length > 0) {
    drawSectionHeading('Examples & Applications');
    for (let idx = 0; idx < payload.notesExamples.length; idx++) {
      drawWrappedBlock(`${idx + 1}. ${payload.notesExamples[idx]}`, {
        size: 10,
        lineHeight: 14.5,
        indent: 4,
        paragraphGap: 6,
      });
    }
  }

  // Page numbers in footer
  const pages = pdfDoc.getPages();
  pages.forEach((p, idx) => {
    const footerText = `Page ${idx + 1} of ${pages.length}`;
    const width = fontRegular.widthOfTextAtSize(footerText, 8.5);
    p.drawText(footerText, {
      x: pageWidth - marginX - width,
      y: 28,
      size: 8.5,
      font: fontRegular,
      color: inkMuted,
    });
    p.drawText(sanitizePdfText(subjectLine), {
      x: marginX,
      y: 28,
      size: 8.5,
      font: fontRegular,
      color: inkMuted,
    });
  });

  return pdfDoc.save();
}
