import { useState, useRef } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Download, Loader2, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

type TranslationStatus = 'idle' | 'uploading' | 'processing' | 'completed' | 'error';

interface TranslationResult {
  jobId: string;
  filename: string;
  pages: number;
  extractedTexts: string[];
  translatedTexts: string[];
}

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<TranslationStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [translationResult, setTranslationResult] = useState<TranslationResult | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
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
        resetState();
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
      resetState();
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    resetState();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const resetState = () => {
    setStatus('idle');
    setProgress(0);
    setCurrentStep('');
    setErrorMessage('');
    setTranslationResult(null);
    setCurrentPage(0);
  };

  const handleTranslate = async () => {
    if (!selectedFile) return;

    setStatus('uploading');
    setProgress(10);
    setCurrentStep('Uploading PDF...');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      setProgress(20);
      setCurrentStep('Processing PDF pages...');

      const response = await fetch('/api/translate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Translation failed');
      }

      setProgress(90);
      setCurrentStep('Finalizing translation...');

      const result: TranslationResult = await response.json();
      
      setTranslationResult(result);
      setStatus('completed');
      setProgress(100);
      setCurrentStep('Translation completed!');

      toast({
        title: "Success!",
        description: `Translated ${result.pages} pages to English. Review the translation before downloading.`,
      });
    } catch (error) {
      setStatus('error');
      setProgress(0);
      setErrorMessage(error instanceof Error ? error.message : 'An error occurred during translation');

      toast({
        title: "Translation failed",
        description: error instanceof Error ? error.message : 'Please try again',
        variant: "destructive",
      });
    }
  };

  const handleDownload = async () => {
    if (!translationResult) return;

    try {
      const response = await fetch(`/api/download/${translationResult.jobId}`);
      
      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedFile?.name.replace('.pdf', '')}_english.pdf` || 'translated_english.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Downloaded!",
        description: "Your translated PDF has been downloaded",
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const isProcessing = status === 'uploading' || status === 'processing';
  const isCompleted = status === 'completed';
  const hasError = status === 'error';
  const hasPreview = translationResult && translationResult.translatedTexts.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 max-w-5xl">
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

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left Column - Upload & Controls */}
          <div className="space-y-6">
            {/* Instructions */}
            <div className="space-y-2">
              <h2 className="text-lg font-medium text-foreground">
                Upload your PDF
              </h2>
              <p className="text-sm text-muted-foreground">
                Select an Assamese PDF file to translate it to English. You'll be able to preview the translation before downloading.
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
                        {currentStep}
                      </p>
                    </div>
                  </div>
                  <Progress value={progress} className="h-2" data-testid="progress-bar" />
                  <p className="text-xs text-muted-foreground">
                    This may take a few minutes depending on PDF size...
                  </p>
                </div>
              </Card>
            )}

            {/* Success Alert */}
            {isCompleted && hasPreview && (
              <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  Translation completed! Review the translation on the right, then download your PDF.
                </AlertDescription>
              </Alert>
            )}

            {/* Error Alert */}
            {hasError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription data-testid="text-error">
                  {errorMessage}
                </AlertDescription>
              </Alert>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
              {!isCompleted ? (
                <Button
                  onClick={handleTranslate}
                  disabled={!selectedFile || isProcessing}
                  className="w-full"
                  size="lg"
                  data-testid="button-translate"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Translating...
                    </>
                  ) : (
                    <>
                      <Eye className="mr-2 h-4 w-4" />
                      Translate & Preview
                    </>
                  )}
                </Button>
              ) : (
                <>
                  <Button
                    onClick={handleDownload}
                    className="w-full"
                    size="lg"
                    data-testid="button-download"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download Translated PDF
                  </Button>
                  <Button
                    onClick={handleRemoveFile}
                    variant="outline"
                    size="lg"
                    className="w-full"
                    data-testid="button-translate-another"
                  >
                    Translate Another File
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Right Column - Preview */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            {hasPreview && translationResult ? (
              <Card className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-foreground">
                      Translation Preview
                    </h3>
                    <div className="text-sm text-muted-foreground">
                      Page {currentPage + 1} of {translationResult.pages}
                    </div>
                  </div>

                  <Tabs defaultValue="translation" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="translation" data-testid="tab-translation">
                        English Translation
                      </TabsTrigger>
                      <TabsTrigger value="original" data-testid="tab-original">
                        Original Text (OCR)
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="translation" className="mt-4">
                      <ScrollArea className="h-[400px] rounded-md border p-4">
                        <div className="text-sm text-foreground whitespace-pre-wrap" data-testid="text-translation-preview">
                          {translationResult.translatedTexts[currentPage] || 'No translation available for this page'}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                    
                    <TabsContent value="original" className="mt-4">
                      <ScrollArea className="h-[400px] rounded-md border p-4">
                        <div className="text-sm text-muted-foreground whitespace-pre-wrap font-mono" data-testid="text-original-preview">
                          {translationResult.extractedTexts[currentPage] || 'No text extracted from this page'}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>

                  {/* Page Navigation */}
                  {translationResult.pages > 1 && (
                    <div className="flex items-center justify-between pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                        disabled={currentPage === 0}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.min(translationResult.pages - 1, currentPage + 1))}
                        disabled={currentPage === translationResult.pages - 1}
                        data-testid="button-next-page"
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ) : (
              <Card className="p-12 text-center border-dashed">
                <Eye className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <h3 className="text-base font-medium text-muted-foreground mb-2">
                  Preview Area
                </h3>
                <p className="text-sm text-muted-foreground">
                  Upload and translate a PDF to see the preview here
                </p>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t py-6">
        <div className="container mx-auto px-4 max-w-5xl">
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
