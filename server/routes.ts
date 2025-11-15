import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fetch from "node-fetch";
import { Mistral } from "@mistralai/mistralai";

const upload = multer({ storage: multer.memoryStorage() });

const mistralClient = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY || "",
});

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

async function extractTextWithMistralOCR(pdfBuffer: Buffer): Promise<{
  pages: Array<{ markdown: string; pageNumber: number }>;
  totalPages: number;
}> {
  console.log('Starting Mistral OCR processing...');
  
  const base64Pdf = pdfBuffer.toString('base64');
  
  try {
    const ocrResponse = await mistralClient.ocr.process({
      model: "mistral-ocr-latest",
      document: {
        type: "document_base64",
        document_base64: base64Pdf,
      },
      includeImageBase64: false,
    });

    console.log(`Mistral OCR processed ${ocrResponse.pages?.length || 0} pages`);
    
    const pages = (ocrResponse.pages || []).map((page, index) => ({
      markdown: page.markdown || "",
      pageNumber: index + 1,
    }));

    return {
      pages,
      totalPages: pages.length,
    };
  } catch (error) {
    console.error('Mistral OCR error:', error);
    throw new Error(`OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function translatePdf(pdfBuffer: Buffer): Promise<{ 
  translatedPdf: Buffer; 
  extractedTexts: string[]; 
  translatedTexts: string[] 
}> {
  console.log('Starting PDF translation process...');
  
  const ocrResult = await extractTextWithMistralOCR(pdfBuffer);
  const numPages = ocrResult.totalPages;
  
  console.log(`Processing ${numPages} pages`);
  
  const extractedTexts: string[] = [];
  const translatedTexts: string[] = [];
  
  for (let i = 0; i < ocrResult.pages.length; i++) {
    const page = ocrResult.pages[i];
    const pageText = page.markdown;
    
    extractedTexts.push(pageText);
    
    if (pageText && pageText.trim().length > 10) {
      console.log(`Page ${i + 1}: ${pageText.length} chars extracted`);
      console.log(`First 200 chars: ${pageText.substring(0, 200)}`);
      
      try {
        const cleanedText = pageText
          .replace(/^#+\s*/gm, '')
          .replace(/\*\*/g, '')
          .replace(/\*/g, '')
          .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
          .replace(/`/g, '')
          .trim();
        
        const translated = await translateWithHuggingFace(cleanedText);
        console.log(`Translation result: ${translated.substring(0, 200)}`);
        translatedTexts.push(translated);
      } catch (error) {
        console.error(`Translation failed for page ${i + 1}:`, error);
        translatedTexts.push(`[Translation failed: ${error}]`);
      }
    } else {
      console.log(`Page ${i + 1} has insufficient text (${pageText.length} chars)`);
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

const translationCache = new Map<string, { 
  translatedPdf: Buffer; 
  extractedTexts: string[]; 
  translatedTexts: string[]; 
  timestamp: number 
}>();

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
