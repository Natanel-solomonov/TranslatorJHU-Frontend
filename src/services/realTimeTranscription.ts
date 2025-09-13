// Real-time transcription using Web Speech API
export class RealTimeTranscriptionService {
  private recognition: any = null;
  private isListening = false;
  private onTranscription: ((text: string, isFinal: boolean) => void) | null = null;
  private onError: ((error: string) => void) | null = null;

  constructor() {
    this.initializeSpeechRecognition();
  }

  private initializeSpeechRecognition() {
    // Check if browser supports speech recognition
    if ('webkitSpeechRecognition' in window) {
      this.recognition = new (window as any).webkitSpeechRecognition();
    } else if ('SpeechRecognition' in window) {
      this.recognition = new (window as any).SpeechRecognition();
    } else {
      console.warn('Speech recognition not supported in this browser');
      return;
    }

    // Configure speech recognition
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 1;

    // Set up event handlers
    this.recognition.onstart = () => {
      console.log('🎤 Real-time speech recognition started');
      this.isListening = true;
    };

    this.recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      // Send interim results for real-time display
      if (interimTranscript && this.onTranscription) {
        this.onTranscription(interimTranscript, false);
      }

      // Send final results
      if (finalTranscript && this.onTranscription) {
        this.onTranscription(finalTranscript, true);
      }
    };

    this.recognition.onend = () => {
      console.log('🎤 Real-time speech recognition ended');
      this.isListening = false;
    };

    this.recognition.onerror = (event: any) => {
      console.error('❌ Speech recognition error:', event.error);
      this.isListening = false;
      if (this.onError) {
        this.onError(`Speech recognition error: ${event.error}`);
      }
    };
  }

  async startListening(): Promise<void> {
    if (!this.recognition) {
      throw new Error('Speech recognition not supported in this browser');
    }

    if (this.isListening) {
      console.log('Already listening');
      return;
    }

    try {
      this.recognition.start();
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      throw error;
    }
  }

  stopListening(): void {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
  }

  setLanguage(language: string): void {
    if (this.recognition) {
      this.recognition.lang = language;
    }
  }

  setOnTranscription(callback: (text: string, isFinal: boolean) => void): void {
    this.onTranscription = callback;
  }

  setOnError(callback: (error: string) => void): void {
    this.onError = callback;
  }

  isSupported(): boolean {
    return this.recognition !== null;
  }

  getSupportedLanguages(): string[] {
    return [
      'en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 
      'it-IT', 'pt-BR', 'ru-RU', 'ja-JP', 'ko-KR',
      'zh-CN', 'ar-SA', 'hi-IN', 'nl-NL', 'sv-SE'
    ];
  }

  get listening(): boolean {
    return this.isListening;
  }
}

export const realTimeTranscriptionService = new RealTimeTranscriptionService();
