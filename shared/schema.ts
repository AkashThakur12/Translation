import { z } from "zod";

export const translationJobSchema = z.object({
  id: z.string(),
  filename: z.string(),
  status: z.enum(['uploading', 'extracting', 'translating', 'generating', 'completed', 'error']),
  progress: z.number().min(0).max(100),
  currentStep: z.string().optional(),
  errorMessage: z.string().optional(),
  originalPages: z.number().optional(),
  translatedPages: z.number().optional(),
  createdAt: z.string(),
});

export type TranslationJob = z.infer<typeof translationJobSchema>;

export const uploadPdfSchema = z.object({
  file: z.instanceof(File).refine(
    (file) => file.type === 'application/pdf',
    'File must be a PDF'
  ),
});

export type UploadPdf = z.infer<typeof uploadPdfSchema>;
