import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { createWorker } from "tesseract.js";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { Canvas, createCanvas, Image } from "canvas";
import fetch from "node-fetch";
import sharp from "sharp";

const upload = multer({ storage: multer.memoryStorage() });

interface TranslationRequest {
  inputs: string;
  parameters?: {
    src_lang?: string;
    tgt_lang?: string;
  };
}

async function preprocessImageForOCR(imageBuffer: Buffer, variant: 'grayscale' | 'adaptive'): Promise<Buffer> {
  try {
    if (variant === 'grayscale') {
      return await sharp(imageBuffer)
        .greyscale()
        .gamma(1.8)
        .normalize()
        .median(3)
        .sharpen({ sigma: 0.8 })
        .png()
        .toBuffer();
    } else {
      return await sharp(imageBuffer)
        .greyscale()
        .normalize()
        .clahe({ width: 32, height: 32, maxSlope: 3 })
        .sharpen({ sigma: 0.5 })
        .png()
        .toBuffer();
    }
  } catch (error) {
    console.error('Image preprocessing error:', error);
    return imageBuffer;
  }
}

interface OCRWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface OCRLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  words: OCRWord[];
}

interface OCRResult {
  text: string;
  confidence: number;
  lines: OCRLine[];
  pageMetrics: {
    viewportWidth: number;
    viewportHeight: number;
    pdfWidth: number;
    pdfHeight: number;
    scale: number;
  };
}

async function translateWithHuggingFace(text: string): Promise<string> {
  if (!text || text.trim().length === 0) {
    return "";
  }

  const response = await fetch(
    "https://api-inference.huggingface.co/models/ai4bharat/indictrans2-indic-en-1B",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: text,
        parameters: {
          src_lang: "asm_Beng",
          tgt_lang: "eng_Latn"
        }
      } as TranslationRequest),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("HuggingFace API error:", response.status, response.statusText, errorText);
    throw new Error(`Translation failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  
  if (Array.isArray(result) && result.length > 0 && result[0]?.translation_text) {
    return result[0].translation_text;
  } else if (result && typeof result === 'object' && 'generated_text' in result && typeof result.generated_text === 'string') {
    return result.generated_text;
  } else if (typeof result === 'string') {
    return result;
  }
  
  console.error("Unexpected API response format:", result);
  throw new Error("Invalid translation response format");
}

async function extractTextFromPdfPage(
  pdfBuffer: Buffer,
  pageNumber: number,
  worker: any
): Promise<OCRResult> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    standardFontDataUrl: "node_modules/pdfjs-dist/standard_fonts/",
  });

  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber + 1);
  
  const targetDPI = 380;
  const baseDPI = 72;
  const scale = targetDPI / baseDPI;
  
  const viewport = page.getViewport({ scale });
  const maxImageSize = 25000000;
  const actualSize = viewport.width * viewport.height;
  const finalScale = actualSize > maxImageSize ? scale * Math.sqrt(maxImageSize / actualSize) : scale;
  const finalViewport = page.getViewport({ scale: finalScale });
  
  const canvas = new Canvas(finalViewport.width, finalViewport.height);
  const context = canvas.getContext("2d");

  await page.render({
    canvasContext: context as any,
    viewport: finalViewport,
    canvas: canvas as any,
  } as any).promise;

  const rawImageData = canvas.toBuffer("image/png");
  
  console.log(`Page ${pageNumber + 1}: Rendered at ${Math.round(finalScale * baseDPI)} DPI (${finalViewport.width}x${finalViewport.height})`);
  
  const results: Array<{ variant: string; result: any; confidence: number }> = [];
  
  for (const variant of ['grayscale', 'adaptive'] as const) {
    const processedImage = await preprocessImageForOCR(rawImageData, variant);
    
    const result = await worker.recognize(processedImage, {
      rotateAuto: true,
    }, {
      blocks: true,
      text: true,
      layoutBlocks: true,
      hocr: false,
      tsv: true,
      box: false,
      unlv: false,
      osd: false,
      pdf: false,
      imageColor: false,
      imageGrey: false,
      imageBinary: false,
      debug: false
    });
    
    const avgConfidence = result.data.confidence || 0;
    results.push({ variant, result, confidence: avgConfidence });
    
    console.log(`Page ${pageNumber + 1} (${variant}): ${result.data.text.length} chars, ${avgConfidence.toFixed(1)}% confidence`);
  }
  
  results.sort((a, b) => b.confidence - a.confidence);
  const bestResult = results[0].result;
  
  console.log(`Page ${pageNumber + 1}: Selected ${results[0].variant} variant (${results[0].confidence.toFixed(1)}% confidence)`);
  
  const words: OCRWord[] = bestResult.data.words?.map((w: any) => ({
    text: w.text || '',
    confidence: w.confidence || 0,
    bbox: {
      x0: w.bbox?.x0 || 0,
      y0: w.bbox?.y0 || 0,
      x1: w.bbox?.x1 || 0,
      y1: w.bbox?.y1 || 0
    }
  })) || [];
  
  const lines: OCRLine[] = [];
  if (words.length > 0) {
    const sortedWords = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0);
    let currentLine: OCRWord[] = [sortedWords[0]];
    
    for (let i = 1; i < sortedWords.length; i++) {
      const word = sortedWords[i];
      const prevWord = sortedWords[i - 1];
      const yTolerance = 4;
      
      if (Math.abs(word.bbox.y0 - prevWord.bbox.y0) < yTolerance) {
        currentLine.push(word);
      } else {
        if (currentLine.length > 0) {
          const lineText = currentLine.map(w => w.text).join(' ');
          const lineConfidence = currentLine.reduce((sum, w) => sum + w.confidence, 0) / currentLine.length;
          const lineBbox = {
            x0: Math.min(...currentLine.map(w => w.bbox.x0)),
            y0: Math.min(...currentLine.map(w => w.bbox.y0)),
            x1: Math.max(...currentLine.map(w => w.bbox.x1)),
            y1: Math.max(...currentLine.map(w => w.bbox.y1))
          };
          lines.push({ text: lineText, confidence: lineConfidence, bbox: lineBbox, words: currentLine });
        }
        currentLine = [word];
      }
    }
    
    if (currentLine.length > 0) {
      const lineText = currentLine.map(w => w.text).join(' ');
      const lineConfidence = currentLine.reduce((sum, w) => sum + w.confidence, 0) / currentLine.length;
      const lineBbox = {
        x0: Math.min(...currentLine.map(w => w.bbox.x0)),
        y0: Math.min(...currentLine.map(w => w.bbox.y0)),
        x1: Math.max(...currentLine.map(w => w.bbox.x1)),
        y1: Math.max(...currentLine.map(w => w.bbox.y1))
      };
      lines.push({ text: lineText, confidence: lineConfidence, bbox: lineBbox, words: currentLine });
    }
  }
  
  const originalPage = await pdf.getPage(pageNumber + 1);
  const originalViewport = originalPage.getViewport({ scale: 1.0 });
  
  return {
    text: bestResult.data.text.trim(),
    confidence: results[0].confidence,
    lines,
    pageMetrics: {
      viewportWidth: finalViewport.width,
      viewportHeight: finalViewport.height,
      pdfWidth: originalViewport.width,
      pdfHeight: originalViewport.height,
      scale: finalScale
    }
  };
}

async function translatePdf(pdfBuffer: Buffer): Promise<{ translatedPdf: Buffer; extractedTexts: string[]; translatedTexts: string[] }> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  
  console.log(`Processing PDF with ${numPages} pages`);
  
  console.log('Initializing Tesseract worker for Assamese with Indic-optimized parameters...');
  const worker = await createWorker('asm', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
      }
    }
  });
  
  await worker.setParameters({
    tessedit_char_blacklist: '',
    lstm_choice_mode: '2',
    preserve_interword_spaces: '1',
    tessedit_write_images: '0'
  });
  console.log('Tesseract configured for Assamese script optimization');
  
  const ocrResults: OCRResult[] = [];
  const extractedTexts: string[] = [];
  const translatedTexts: string[] = [];
  
  try {
    for (let i = 0; i < numPages; i++) {
      console.log(`Extracting text from page ${i + 1}/${numPages}`);
      const ocrResult = await extractTextFromPdfPage(pdfBuffer, i, worker);
      ocrResults.push(ocrResult);
      extractedTexts.push(ocrResult.text);
      
      if (ocrResult.text && ocrResult.text.length > 10) {
        console.log(`Page ${i + 1}: ${ocrResult.lines.length} lines, ${ocrResult.text.length} chars, ${ocrResult.confidence.toFixed(1)}% confidence`);
        console.log(`First 100 chars: ${ocrResult.text.substring(0, 100)}`);
        
        try {
          const linesText = ocrResult.lines.map(line => line.text).join('\n');
          const translated = await translateWithHuggingFace(linesText);
          console.log(`Translation result: ${translated.substring(0, 100)}`);
          translatedTexts.push(translated);
        } catch (error) {
          console.error(`Translation failed for page ${i + 1}:`, error);
          translatedTexts.push(`[Translation failed: ${error}]`);
        }
      } else {
        console.log(`Page ${i + 1} has insufficient text (${ocrResult.text.length} chars)`);
        translatedTexts.push("");
      }
    }
  } finally {
    await worker.terminate();
    console.log('Tesseract worker terminated');
  }
  
  const originalPdfDoc = await PDFDocument.load(pdfBuffer);
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  const pages = await pdfDoc.copyPages(
    originalPdfDoc,
    originalPdfDoc.getPageIndices()
  );
  
  pages.forEach((page, index) => {
    pdfDoc.addPage(page);
    const { width, height } = page.getSize();
    
    const translatedText = translatedTexts[index] || "";
    if (!translatedText) return;
    
    const fontSize = 9;
    const margin = 25;
    const lineHeight = fontSize * 1.3;
    const maxWidth = width - margin * 2;
    let y = height - margin;
    
    const paragraphs = translatedText.split(/\n\n+/);
    
    for (const paragraph of paragraphs) {
      const words = paragraph.split(/\s+/).filter(w => w.length > 0);
      let line = "";
      
      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        const textWidth = font.widthOfTextAtSize(testLine, fontSize);
        
        if (textWidth <= maxWidth) {
          line = testLine;
        } else {
          if (line) {
            page.drawText(line, {
              x: margin,
              y,
              size: fontSize,
              font,
              color: rgb(0, 0, 0.8),
            });
            y -= lineHeight;
          }
          line = word;
          
          if (y < margin + lineHeight) break;
        }
      }
      
      if (line && y >= margin) {
        page.drawText(line, {
          x: margin,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0.8),
        });
        y -= lineHeight;
      }
      
      y -= lineHeight * 0.5;
      if (y < margin) break;
    }
  });
  
  const translatedPdfBytes = await pdfDoc.save();
  return {
    translatedPdf: Buffer.from(translatedPdfBytes),
    extractedTexts,
    translatedTexts,
  };
}

const translationCache = new Map<string, { translatedPdf: Buffer; extractedTexts: string[]; translatedTexts: string[]; timestamp: number }>();

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/translate", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      if (req.file.mimetype !== "application/pdf") {
        return res.status(400).json({ error: "File must be a PDF" });
      }

      console.log(`Starting translation process for ${req.file.originalname}...`);
      const result = await translatePdf(req.file.buffer);
      
      const jobId = Date.now().toString() + Math.random().toString(36).substring(7);
      translationCache.set(jobId, { ...result, timestamp: Date.now() });
      
      setTimeout(() => translationCache.delete(jobId), 30 * 60 * 1000);
      
      res.json({
        jobId,
        filename: req.file.originalname,
        pages: result.extractedTexts.length,
        extractedTexts: result.extractedTexts,
        translatedTexts: result.translatedTexts,
      });
    } catch (error) {
      console.error("Translation error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Translation failed",
      });
    }
  });

  app.get("/api/download/:jobId", async (req, res) => {
    try {
      const cached = translationCache.get(req.params.jobId);
      
      if (!cached) {
        return res.status(404).json({ error: "Translation job not found or expired" });
      }
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="translated_english.pdf"`
      );
      res.send(cached.translatedPdf);
    } catch (error) {
      console.error("Download error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Download failed",
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
