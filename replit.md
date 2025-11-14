# Assamese → English PDF Translator

## Overview
A completely free, unlimited Assamese to English PDF translator using 100% open-source tools. No API keys, no billing, no external dependencies required.

## Purpose
Translate Assamese language PDF documents to English while preserving the original layout and formatting. Built for accessibility and ease of use.

## Current State
Full-stack application with React frontend and Node.js backend, utilizing free AI services for OCR and translation.

## Technology Stack

### Frontend
- React with TypeScript
- Wouter for routing
- TanStack Query for state management
- Shadcn UI components
- Tailwind CSS for styling
- Material Design principles

### Backend
- Node.js with Express
- Tesseract.js for Assamese OCR (free, no API key)
- HuggingFace IndicTrans2 for translation (free inference API)
- PDF-lib for PDF manipulation
- Multer for file uploads

## Key Features

### Core Functionality
1. **PDF Upload** - Drag-and-drop or file browser interface
2. **OCR Processing** - Extract Assamese text using Tesseract.js
3. **Translation** - Translate to English using HuggingFace IndicTrans2
4. **PDF Regeneration** - Overlay translated text on original PDF
5. **Download** - Get translated PDF with preserved layout

### User Experience
- Clean, professional Material Design UI
- Real-time progress tracking
- Clear status feedback
- Error handling with helpful messages
- Responsive design for all devices
- Beautiful loading states and animations

## Architecture Decisions

### Why These Technologies?
- **Tesseract.js** - Free, robust OCR supporting Assamese script
- **HuggingFace IndicTrans2** - State-of-the-art Indian language translation model
- **PDF-lib** - Pure JavaScript PDF manipulation
- **No Google Cloud** - Completely free, no billing required
- **No API Keys** - HuggingFace inference API is free and public

### Translation Pipeline
1. Upload PDF → Server receives file
2. Convert PDF pages to images
3. Run Tesseract OCR with Assamese traineddata
4. Send extracted text to HuggingFace IndicTrans2
5. Receive English translations
6. Overlay translations on original PDF using PDF-lib
7. Return translated PDF for download

## Project Structure
```
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   └── home.tsx          # Main translation interface
│   │   ├── components/ui/        # Shadcn components
│   │   ├── lib/                  # Utilities
│   │   └── App.tsx               # Root component
├── server/
│   ├── routes.ts                 # API endpoints
│   └── index.ts                  # Server setup
├── shared/
│   └── schema.ts                 # TypeScript types
```

## Recent Changes
- 2024-01-14: Switched from Google Cloud to free open-source stack
- 2024-01-14: Implemented Tesseract.js for OCR
- 2024-01-14: Integrated HuggingFace IndicTrans2 for translation
- 2024-01-14: Built Material Design UI with progress tracking

## User Preferences
- Clean, minimal, utility-focused design
- Fast, responsive interactions
- Clear visual feedback during processing
- No complexity - simple upload → translate → download flow

## Development Notes
- All dependencies are free and open-source
- No external API keys or secrets required
- Runs entirely within Replit environment
- Translation quality optimized for Assamese → English
