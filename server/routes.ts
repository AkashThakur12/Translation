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
  pageNumber: number
): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    standardFontDataUrl: "node_modules/pdfjs-dist/standard_fonts/",
  });

  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber + 1);
  
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = new Canvas(viewport.width, viewport.height);
  const context = canvas.getContext("2d");

  await page.render({
    canvasContext: context as any,
    viewport: viewport,
    canvas: canvas as any,
  } as any).promise;

  const imageData = canvas.toBuffer("image/png");
  
  const worker = await createWorker("asm");
  
  const { data: { text } } = await worker.recognize(imageData);
  await worker.terminate();
  
  return text.trim();
}

async function translatePdf(pdfBuffer: Buffer): Promise<Buffer> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  
  console.log(`Processing PDF with ${numPages} pages`);
  
  const translatedTexts: string[] = [];
  
  for (let i = 0; i < numPages; i++) {
    console.log(`Extracting text from page ${i + 1}/${numPages}`);
    const text = await extractTextFromPdfPage(pdfBuffer, i);
    
    if (text && text.length > 0) {
      console.log(`Translating page ${i + 1}/${numPages}`);
      const translated = await translateWithHuggingFace(text);
      translatedTexts.push(translated);
    } else {
      console.log(`Page ${i + 1} has no text`);
      translatedTexts.push("");
    }
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
    
    const fontSize = 10;
    const margin = 30;
    const maxWidth = width - margin * 2;
    let y = height - margin;
    
    const words = translatedText.split(/\s+/);
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
            color: rgb(0, 0, 0),
          });
          y -= fontSize * 1.4;
        }
        line = word;
        
        if (y < margin) break;
      }
    }
    
    if (line && y >= margin) {
      page.drawText(line, {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
    }
  });
  
  const translatedPdfBytes = await pdfDoc.save();
  return Buffer.from(translatedPdfBytes);
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/translate", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      if (req.file.mimetype !== "application/pdf") {
        return res.status(400).json({ error: "File must be a PDF" });
      }

      console.log("Starting translation process...");
      const translatedPdf = await translatePdf(req.file.buffer);
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="translated_${req.file.originalname}"`
      );
      res.send(translatedPdf);
    } catch (error) {
      console.error("Translation error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Translation failed",
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
