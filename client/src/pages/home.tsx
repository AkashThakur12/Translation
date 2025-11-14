import { useState, useRef } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type TranslationStatus = 'idle' | 'uploading' | 'extracting' | 'translating' | 'generating' | 'completed' | 'error';

interface TranslationProgress {
  status: TranslationStatus;
  progress: number;
  currentStep: string;
  errorMessage?: string;
}

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [translationProgress, setTranslationProgress] = useState<TranslationProgress>({
    status: 'idle',
    progress: 0,
    currentStep: '',
  });
  const [translatedPdfUrl, setTranslatedPdfUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf') {
        setSelectedFile(file);
        setTranslationProgress({ status: 'idle', progress: 0, currentStep: '' });
        setTranslatedPdfUrl(null);
      } else {
        toast({
          title: "Invalid file type",
          description: "Please select a PDF file",
          variant: "destructive",
        });
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
      setTranslationProgress({ status: 'idle', progress: 0, currentStep: '' });
      setTranslatedPdfUrl(null);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setTranslationProgress({ status: 'idle', progress: 0, currentStep: '' });
    setTranslatedPdfUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleTranslate = async () => {
    if (!selectedFile) return;

    setTranslationProgress({
      status: 'uploading',
      progress: 0,
      currentStep: 'Uploading PDF...',
    });

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/translate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Translation failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setTranslatedPdfUrl(url);
      
      setTranslationProgress({
        status: 'completed',
        progress: 100,
        currentStep: 'Translation completed!',
      });

      toast({
        title: "Success!",
        description: "Your PDF has been translated to English",
      });
    } catch (error) {
      setTranslationProgress({
        status: 'error',
        progress: 0,
        currentStep: '',
        errorMessage: error instanceof Error ? error.message : 'An error occurred during translation',
      });

      toast({
        title: "Translation failed",
        description: "Please try again or check your PDF file",
        variant: "destructive",
      });
    }
  };

  const handleDownload = () => {
    if (translatedPdfUrl && selectedFile) {
      const a = document.createElement('a');
      a.href = translatedPdfUrl;
      a.download = `${selectedFile.name.replace('.pdf', '')}_english.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const isProcessing = ['uploading', 'extracting', 'translating', 'generating'].includes(translationProgress.status);
  const isCompleted = translationProgress.status === 'completed';
  const hasError = translationProgress.status === 'error';

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 max-w-2xl">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Assamese → English Translator
            </h1>
            <p className="text-sm text-muted-foreground">
              Free PDF translation powered by open-source AI
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="space-y-6">
          {/* Instructions */}
          <div className="space-y-2">
            <h2 className="text-lg font-medium text-foreground">
              Upload your PDF
            </h2>
            <p className="text-sm text-muted-foreground">
              Select an Assamese PDF file to translate it to English. The original layout will be preserved.
            </p>
          </div>

          {/* Upload Zone */}
          {!selectedFile ? (
            <Card
              className={`border-2 border-dashed transition-colors cursor-pointer ${
                isDragging 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border hover:border-primary/50 hover-elevate'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handleBrowseClick}
              data-testid="dropzone-upload"
            >
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="mb-4 rounded-full bg-primary/10 p-4">
                  <Upload className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mb-2 text-base font-medium text-foreground">
                  Drop your PDF here
                </h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  or click to browse files
                </p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBrowseClick();
                  }}
                  data-testid="button-browse"
                >
                  Browse Files
                </Button>
                <p className="mt-4 text-xs text-muted-foreground">
                  Supports PDF files up to 50MB
                </p>
              </div>
            </Card>
          ) : (
            <Card className="p-6">
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-primary/10 p-3">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground truncate" data-testid="text-filename">
                    {selectedFile.name}
                  </h3>
                  <p className="text-sm text-muted-foreground" data-testid="text-filesize">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
                {!isProcessing && !isCompleted && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveFile}
                    data-testid="button-remove"
                  >
                    Remove
                  </Button>
                )}
              </div>
            </Card>
          )}

          {/* Progress Section */}
          {isProcessing && (
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground" data-testid="text-progress-step">
                      {translationProgress.currentStep}
                    </p>
                  </div>
                </div>
                <Progress value={translationProgress.progress} className="h-2" data-testid="progress-bar" />
              </div>
            </Card>
          )}

          {/* Success Alert */}
          {isCompleted && (
            <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                Translation completed successfully! Your PDF is ready to download.
              </AlertDescription>
            </Alert>
          )}

          {/* Error Alert */}
          {hasError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription data-testid="text-error">
                {translationProgress.errorMessage}
              </AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            {!isCompleted ? (
              <Button
                onClick={handleTranslate}
                disabled={!selectedFile || isProcessing}
                className="flex-1"
                size="lg"
                data-testid="button-translate"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Translating...
                  </>
                ) : (
                  'Translate to English'
                )}
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleDownload}
                  className="flex-1"
                  size="lg"
                  data-testid="button-download"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Translated PDF
                </Button>
                <Button
                  onClick={() => {
                    handleRemoveFile();
                  }}
                  variant="outline"
                  size="lg"
                  data-testid="button-translate-another"
                >
                  Translate Another
                </Button>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t py-6">
        <div className="container mx-auto px-4 max-w-2xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>Powered by Tesseract.js & HuggingFace IndicTrans2</p>
            <p>100% Free • No API Keys Required</p>
          </div>
        </div>
      </footer>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileSelect}
        className="hidden"
        data-testid="input-file"
      />
    </div>
  );
}
