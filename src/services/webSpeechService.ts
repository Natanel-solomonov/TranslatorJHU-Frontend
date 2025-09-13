// Web Speech API service for free speech recognition
export class WebSpeechService {
  private recognition: any = null;
  private isListening = false;

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
  }

  async startListening(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.recognition) {
        reject(new Error('Speech recognition not supported'));
        return;
      }

      let finalTranscript = '';

      this.recognition.onstart = () => {
        console.log('🎤 Speech recognition started');
        this.isListening = true;
      };

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        console.log('📝 Interim:', interimTranscript);
        console.log('📝 Final:', finalTranscript);
      };

      this.recognition.onend = () => {
        console.log('🎤 Speech recognition ended');
        this.isListening = false;
        resolve(finalTranscript.trim() || 'No speech detected');
      };

      this.recognition.onerror = (event: any) => {
        console.error('❌ Speech recognition error:', event.error);
        this.isListening = false;
        reject(new Error(`Speech recognition error: ${event.error}`));
      };

      this.recognition.start();
    });
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
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
}

export const webSpeechService = new WebSpeechService();
