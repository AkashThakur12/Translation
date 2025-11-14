import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { createWorker } from "tesseract.js";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { Canvas } from "canvas";
import fetch from "node-fetch";

const upload = multer({ storage: multer.memoryStorage() });

interface TranslationRequest {
  inputs: string;
  parameters?: {
    src_lang?: string;
    tgt_lang?: string;
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
): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    standardFontDataUrl: "node_modules/pdfjs-dist/standard_fonts/",
  });

  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber + 1);
  
  const viewport = page.getViewport({ scale: 3.0 });
  const canvas = new Canvas(viewport.width, viewport.height);
  const context = canvas.getContext("2d");

  await page.render({
    canvasContext: context as any,
    viewport: viewport,
    canvas: canvas as any,
  } as any).promise;

  const imageData = canvas.toBuffer("image/png");
  
  console.log(`Page ${pageNumber + 1}: Rendered to ${viewport.width}x${viewport.height}, image size: ${imageData.length} bytes`);
  
  const { data: { text, confidence } } = await worker.recognize(imageData, {
    rotateAuto: true,
  });
  
  console.log(`Page ${pageNumber + 1}: Extracted ${text.length} chars with ${confidence}% confidence`);
  
  return text.trim();
}

async function translatePdf(pdfBuffer: Buffer): Promise<{ translatedPdf: Buffer; extractedTexts: string[]; translatedTexts: string[] }> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  
  console.log(`Processing PDF with ${numPages} pages`);
  
  console.log('Initializing Tesseract worker for Assamese...');
  const worker = await createWorker('asm', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
      }
    }
  });
  
  const extractedTexts: string[] = [];
  const translatedTexts: string[] = [];
  
  try {
    for (let i = 0; i < numPages; i++) {
      console.log(`Extracting text from page ${i + 1}/${numPages}`);
      const text = await extractTextFromPdfPage(pdfBuffer, i, worker);
      extractedTexts.push(text);
      
      if (text && text.length > 10) {
        console.log(`Translating page ${i + 1}/${numPages} (${text.length} characters)`);
        console.log(`First 100 chars: ${text.substring(0, 100)}`);
        
        try {
          const translated = await translateWithHuggingFace(text);
          console.log(`Translation result: ${translated.substring(0, 100)}`);
          translatedTexts.push(translated);
        } catch (error) {
          console.error(`Translation failed for page ${i + 1}:`, error);
          translatedTexts.push(`[Translation failed: ${error}]`);
        }
      } else {
        console.log(`Page ${i + 1} has insufficient text (${text.length} chars)`);
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
