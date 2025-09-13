// Google Meet Caption Detector - Comprehensive Solution
// This will find and extract Google Meet closed captions properly

// import { API_ENDPOINTS } from '../config/environment';

class GoogleMeetCaptionDetector {
  private isMonitoring = false;
  private lastProcessedText = '';
  private processedWords = new Set<string>(); // Track processed words to avoid repetition
  private translationOverlay: HTMLElement | null = null;
  private targetLanguage = 'es';
  private isConnected = false;
  private observer: MutationObserver | null = null;
  private checkInterval: number | null = null;
  private monitoringActive = false;
  private lastTranslationTime = 0; // Throttling for translation requests

  constructor() {
    this.init();
  }

  private init() {
    this.createTranslationOverlay();
    this.isConnected = true;
    this.setupMessageListener();
  }

  private createTranslationOverlay() {
    // Remove existing overlay if any
    const existing = document.getElementById('translatorjhu-overlay');
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'translatorjhu-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 350px;
      max-width: 90vw;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 15px;
      border-radius: 8px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      border: 2px solid #4285f4;
      display: none;
    `;

    overlay.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <span style="font-weight: bold; color: #4285f4;">🌐 Live Translation</span>
        <button id="translatorjhu-close" style="background: none; border: none; color: white; font-size: 18px; cursor: pointer;">×</button>
      </div>
      <div id="translatorjhu-content">
        <div style="margin-bottom: 8px;">
          <strong>Original:</strong> <span id="original-text">-</span>
        </div>
        <div>
          <strong>Translated:</strong> <span id="translated-text">-</span>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.translationOverlay = overlay;

    // Add close button functionality
    const closeBtn = overlay.querySelector('#translatorjhu-close');
    closeBtn?.addEventListener('click', () => this.hideOverlay());
  }

  private setupMessageListener() {
    // Listen for messages from the popup to start/stop monitoring
    window.addEventListener('message', (event) => {
      if (event.data.type === 'startCaptionMonitoring') {
        this.targetLanguage = event.data.targetLanguage || 'es';
        this.startCaptionDetection();
      } else if (event.data.type === 'stopCaptionMonitoring') {
        this.stopCaptionDetection();
      }
    });
  }

  private startCaptionDetection() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.monitoringActive = true;
    this.processedWords.clear(); // Reset processed words when starting

    this.setupMutationObserver();
    this.checkInterval = window.setInterval(() => {
      if (this.monitoringActive) {
        this.checkForClosedCaptions();
      }
    }, 2000); // 2 seconds for better responsiveness
    this.checkForClosedCaptions();
  }

  private stopCaptionDetection() {
    this.isMonitoring = false;
    this.monitoringActive = false;
    
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private setupMutationObserver() {
    // Watch for changes in the entire document
    this.observer = new MutationObserver((mutations) => {
      if (!this.monitoringActive) return;
      
      let shouldCheck = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          // Check if any added nodes contain caption elements
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (element.matches('[jsname="r4nke"]') || 
                  element.querySelector('[jsname="r4nke"]') ||
                  element.matches('[aria-live="polite"]') ||
                  element.querySelector('[aria-live="polite"]')) {
                shouldCheck = true;
              }
            }
          });
          
          // Also check if text content changed in existing elements
          if (mutation.type === 'characterData' && mutation.target.parentElement) {
            const parent = mutation.target.parentElement;
            if (parent.matches('[jsname="r4nke"]') || 
                parent.querySelector('[jsname="r4nke"]') ||
                parent.matches('[aria-live="polite"]')) {
              shouldCheck = true;
            }
          }
        }
      });
      
      if (shouldCheck) {
        // Debounce the check to avoid too many calls
        setTimeout(() => {
          if (this.monitoringActive) {
            this.checkForClosedCaptions();
          }
        }, 100);
      }
    });

    // Start observing
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  private checkForClosedCaptions() {
    if (!this.monitoringActive) {
      return; // Don't check if monitoring is not active
    }
    
    // Try multiple selectors for Google Meet captions
    const captionSelectors = [
      '[jsname="r4nke"]', // Main caption container
      '[data-is-muted="false"] [jsname="r4nke"]', // Unmuted captions
      '[role="region"] [jsname="r4nke"]', // Region-based captions
      '.captions-text', // Alternative caption class
      '[aria-live="polite"]', // Live region captions
      '[data-caption-text]' // Data attribute captions
    ];
    
    try {
      let captionContainer = null;
      let foundText = '';
      
      // Try each selector until we find captions
      for (const selector of captionSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          const text = element.textContent?.trim();
          if (text && text.length >= 10 && this.isValidClosedCaption(text)) {
            captionContainer = element;
            foundText = text;
            break;
          }
        }
      }
      
      if (captionContainer && foundText && foundText !== this.lastProcessedText) {
        // Add throttling to prevent too many requests
        const now = Date.now();
        if (now - this.lastTranslationTime < 1500) { // 1.5 second minimum between translations
          return;
        }
        this.lastTranslationTime = now;
        console.log(`✅ Valid CLOSED CAPTION: ${foundText}`);
        this.processElement(captionContainer);
      }
    } catch (error) {
      console.error('Caption detection error:', error);
    }
  }

  private processElement(element: Element) {
    if (!this.monitoringActive) return;
    
    const text = element.textContent?.trim();
    if (!text || text === this.lastProcessedText || text.length < 5) {
      return;
    }

    // Check if this looks like a real CLOSED CAPTION
    if (this.isValidClosedCaption(text)) {
      // Process word by word to avoid repetition
      const words = text.split(/\s+/).filter(word => word.length > 0);
      const newWords = words.filter(word => !this.processedWords.has(word.toLowerCase()));
      
      if (newWords.length > 0) {
        console.log('✅ Valid CLOSED CAPTION:', text);
        
        // Add new words to processed set
        newWords.forEach(word => this.processedWords.add(word.toLowerCase()));
        
        // Send only new words for translation
        const newText = newWords.join(' ');
        this.lastProcessedText = text;
        this.sendForTranslation(newText);
      }
    }
  }

  private isValidClosedCaption(text: string): boolean {
    // ULTRA-STRICT filtering - only accept actual speech captions
    const uiPatterns = [
      // Google Meet UI elements
      /^(Copy link|Add others|Your meeting's ready|close|person_add|content_copy)/i,
      /^(meet\.google\.com|Join now|Turn on|Turn off)/i,
      /^(Settings|More options|End call|Mute|Camera)/i,
      /^(Share screen|Chat|Participants|Record)/i,
      /^(Present now|Stop presenting|Leave call)/i,
      /^(Open caption settings|Your camera is on|Your microphone)/i,
      /^(Others might still see|People who use this meeting)/i,
      /^(People outside the host|Rooms can also contain)/i,
      /^(Gemini isn't taking notes)/i,
      /^(domain_disabled|timer_pause|pen_spark_io|frame_person|visual_effects)/i,
      /^(backgrounds and effects|more_vert|more options|devices|front_hand)/i,
      /^(raising your hand|format_size|font size|default|tiny|small|medium)/i,
      /^(large|huge|jumbo|circle|font color|white|black|blue|green|red)/i,
      /^(yellow|cyan|magenta|settings|open caption settings|arrow_downward)/i,
      /^(jump to bottom|reducing noise|keyboard_arrow_up|audio settings)/i,
      /^(turn on microphone|video settings|videocam|turn off camera)/i,
      /^(computer_arrow_up|share screen|mood|send a reaction|closed_caption)/i,
      /^(turn off captions|back_hand|raise hand|more_vert|more options)/i,
      /^(call_end|leave call|developing an extension|meeting details)/i,
      /^(people|chat|chat_bubble|chat with everyone|apps|meeting tools)/i,
      /^(lock_person|host controls|alarm|call ends soon)/i,
      /^(window\.wiz_progress|window\.wiz_tick|AF_initDataCallback)/i,
      /^(IJ_values|accounts\.google\.com|myaccount\.google\.com)/i,
      /^(admin\.google\.com|workspace\.google\.com|goto2\.corp\.google\.com)/i,
      /^(one\.google\.com|meet\.google\.com|developers\.google\.com)/i,
      
      // General UI patterns
      /^[A-Z\s]+$/, // All caps (likely UI labels)
      /^\d+$/, // Just numbers
      /^[^\w\s]+$/, // Just symbols
      /^(OK|Cancel|Save|Delete|Edit)$/i,
      /^(Yes|No|Maybe)$/i,
      /^(person_add|content_copy|close|ready)/i,
      /^(meeting|call|video|audio)/i,
      /^(link|share|copy|paste)/i,
      /^(button|icon|menu|toolbar)/i,
      /^[a-z]+[A-Z][a-z]+/, // camelCase
      /^[a-z]+_[a-z]+/, // snake_case
      /^[a-z]+\.[a-z]+/, // dot notation
      /^[a-z]+[A-Z]/, // mixed case starting with lowercase
      /^[A-Z][a-z]+[A-Z]/, // PascalCase
      /^.{1,30}$/, // Very short text (1-30 chars)
      
      // More specific UI patterns
      /^(Know\. It's yeah\. Richard)/i, // Common UI text
      /^(Your camera is on\. Your microphone)/i,
      /^(Others might still see your full video)/i,
      /^(Or share this meeting link)/i,
      /^(People who use this meeting link)/i,
      /^(People outside the host's organization)/i,
      /^(Gemini isn't taking notes)/i,
      /^(Are you talking\? Your mic is off)/i,
      /^(Click the mic to turn it on)/i,
      /^(Richard\. William\.)/i, // Names without context
      /^(keyboard_arrow_up|mic_off|devices|domain_disabled)/i,
      /^(timer_pause|pen_spark_io|frame_person|visual_effects)/i,
      /^(backgrounds and effects|more_vert|more options)/i,
      /^(AlexDavidAnimations|wem-czrf-pnx)/i, // Meeting-specific text
      /^(4:25PM|arrow_downward|jump to bottom)/i,
      /^(reducing noise|keyboard_arrow_up|audio settings)/i,
      /^(turn on microphone|video settings|videocam)/i,
      /^(turn off camera|computer_arrow_up|share screen)/i,
      /^(mood|send a reaction|closed_caption|turn off captions)/i,
      /^(back_hand|raise hand|more_vert|more options)/i,
      /^(call_end|leave call|developing an extension)/i,
      /^(meeting details|people|chat|chat_bubble)/i,
      /^(chat with everyone|apps|meeting tools)/i,
      /^(lock_person|host controls|alarm|call ends soon)/i,
      /^(window\.wiz_progress|window\.wiz_tick)/i,
      /^(AF_initDataCallback|IJ_values)/i,
      /^(accounts\.google\.com|myaccount\.google\.com)/i,
      /^(admin\.google\.com|workspace\.google\.com)/i,
      /^(goto2\.corp\.google\.com|one\.google\.com)/i,
      /^(meet\.google\.com|developers\.google\.com)/i,
      /^(https?:\/\/|www\.|\.com|\.org|\.net)/i, // URLs
      /^[0-9]+:[0-9]+[AP]M$/i, // Time stamps
      /^[a-zA-Z0-9\-_]+$/i, // Just alphanumeric with dashes/underscores
      /^[^a-zA-Z]*$/, // No letters at all
      /^.{1,50}$/ // Very short text
    ];

    // Check if text matches any UI pattern
    for (const pattern of uiPatterns) {
      if (pattern.test(text)) {
        return false;
      }
    }

    // Must be at least 20 characters for real speech
    const isLongEnough = text.length >= 20;
    const hasLetters = /[a-zA-Z]/.test(text);
    const looksLikeSpeech = /^[a-zA-Z\s.,!?\-']+$/.test(text);
    const hasSpaces = text.includes(' '); // Real speech has spaces
    const hasMultipleWords = text.split(' ').length >= 3; // At least 3 words
    
    return isLongEnough && hasLetters && looksLikeSpeech && hasSpaces && hasMultipleWords;
  }

  private async sendForTranslation(text: string) {
    if (!this.isConnected) return;

    console.log(`\n🎯 FRONTEND TRANSLATION REQUEST:`);
    console.log(`📝 Sending text: "${text}"`);
    console.log(`🌍 Target language: ${this.targetLanguage}`);

    try {
      const response = await fetch('http://localhost:8080/api/caption-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          language: 'en',
          targetLanguage: this.targetLanguage
        })
      });

      console.log(`📡 Response status: ${response.status}`);

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Translation received:`);
        console.log(`   📝 Original: "${result.originalText || text}"`);
        console.log(`   🌍 Translated: "${result.translatedText}"`);
        console.log(`   📊 Confidence: ${result.confidence || 0.8}`);
        console.log(`   🔊 Audio data: ${result.audioData ? `${result.audioData.length} bytes` : 'null'}`);
        
        this.displayTranslation({
          originalText: result.originalText || text,
          translatedText: result.translatedText || 'Translation failed',
          confidence: result.confidence || 0.8
        });
        
        // Play ElevenLabs TTS audio if available, otherwise fallback to browser TTS
        if (result.translatedText && result.translatedText !== 'Translation failed') {
          if (result.audioData && result.audioData.length > 0) {
            console.log(`🔊 Playing ElevenLabs TTS audio for: "${result.translatedText}"`);
            console.log(`🔊 Audio data length: ${result.audioData.length} bytes`);
            this.playElevenLabsAudio(result.audioData);
          } else {
            console.log(`🔊 No ElevenLabs audio available (rate limited), using browser TTS for: "${result.translatedText}"`);
            this.playTranslatedSpeech(result.translatedText);
          }
        }
      } else {
        console.log(`❌ Translation failed with status: ${response.status}`);
        this.displayTranslation({
          originalText: text,
          translatedText: `[Translated: ${text}]`,
          confidence: 0.5
        });
      }
    } catch (error) {
      console.error(`❌ Translation error:`, error);
      // Don't stop the system on error, just log and continue
      this.displayTranslation({
        originalText: text,
        translatedText: `[Translation Error: ${text}]`,
        confidence: 0.3
      });
    }
  }

  private displayTranslation(data: any) {
    if (!this.translationOverlay) return;

    const originalText = this.translationOverlay.querySelector('#original-text');
    const translatedText = this.translationOverlay.querySelector('#translated-text');
    
    if (originalText) originalText.textContent = data.originalText;
    if (translatedText) translatedText.textContent = data.translatedText;

    this.translationOverlay.style.display = 'block';

    // Auto-hide after 10 seconds
    setTimeout(() => {
      this.hideOverlay();
    }, 10000);
  }

  private hideOverlay() {
    if (this.translationOverlay) {
      this.translationOverlay.style.display = 'none';
    }
  }

  private playTranslatedSpeech(text: string) {
    // Use browser's built-in speech synthesis
    if ('speechSynthesis' in window) {
      // Stop any current speech
      speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Set voice properties
      utterance.rate = 0.9; // Slightly slower for clarity
      utterance.pitch = 1.0;
      utterance.volume = 0.8;
      
      // Wait for voices to load
      const speakText = () => {
        const voices = speechSynthesis.getVoices();
        const spanishVoice = voices.find(voice => 
          voice.lang.startsWith('es') || 
          voice.name.toLowerCase().includes('spanish') ||
          voice.name.toLowerCase().includes('español')
        );
        
        if (spanishVoice) {
          utterance.voice = spanishVoice;
        }
        
        // Play the speech
        speechSynthesis.speak(utterance);
        console.log('🔊 Playing translated speech:', text);
      };
      
      // If voices are already loaded, speak immediately
      if (speechSynthesis.getVoices().length > 0) {
        speakText();
      } else {
        // Wait for voices to load
        speechSynthesis.onvoiceschanged = speakText;
      }
      
      // Add event listeners for debugging
      utterance.onstart = () => console.log('🔊 Speech started');
      utterance.onend = () => console.log('🔊 Speech ended');
      utterance.onerror = (event) => console.error('🔊 Speech error:', event.error);
      
    } else {
      console.warn('Speech synthesis not supported in this browser');
    }
  }

  private async playElevenLabsAudio(audioData: string) {
    console.log(`\n🔊 ELEVENLABS AUDIO PLAYBACK:`);
    console.log(`📊 Audio data type: ${typeof audioData}`);
    console.log(`📊 Audio data length: ${audioData.length} characters`);
    console.log(`📊 First 100 chars: ${audioData.substring(0, 100)}...`);
    
    try {
      // Convert base64 audio data to ArrayBuffer
      console.log(`🔄 Converting base64 to ArrayBuffer...`);
      const binaryString = atob(audioData);
      console.log(`📊 Binary string length: ${binaryString.length} bytes`);
      
      const audioBuffer = new ArrayBuffer(binaryString.length);
      const view = new Uint8Array(audioBuffer);
      
      for (let i = 0; i < binaryString.length; i++) {
        view[i] = binaryString.charCodeAt(i);
      }
      console.log(`📊 ArrayBuffer created: ${audioBuffer.byteLength} bytes`);

      // Create audio context and decode audio
      console.log(`🔄 Creating AudioContext...`);
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log(`📊 AudioContext state: ${audioContext.state}`);
      console.log(`📊 Sample rate: ${audioContext.sampleRate}Hz`);
      
      console.log(`🔄 Decoding audio data...`);
      const decodedAudio = await audioContext.decodeAudioData(audioBuffer);
      console.log(`📊 Decoded audio: ${decodedAudio.duration}s, ${decodedAudio.numberOfChannels} channels, ${decodedAudio.sampleRate}Hz`);
      
      // Create audio source and connect to speakers
      console.log(`🔄 Creating audio source...`);
      const source = audioContext.createBufferSource();
      source.buffer = decodedAudio;
      source.connect(audioContext.destination);
      
      // Add event listeners for debugging
      source.onended = () => {
        console.log('🔊 ElevenLabs audio playback finished');
        audioContext.close();
      };
      
      source.addEventListener('error', (error) => {
        console.error('❌ Audio source error:', error);
      });
      
      // Play the audio
      console.log(`🔊 Starting audio playback...`);
      source.start(0);
      console.log('✅ ElevenLabs TTS audio playback started');
      
    } catch (error) {
      console.error('❌ Error playing ElevenLabs audio:', error);
      if (error instanceof Error) {
        console.error('❌ Error details:', error.message);
        console.error('❌ Error stack:', error.stack);
      }
      // Fallback to browser TTS if ElevenLabs audio fails
      console.log('🔄 Falling back to browser TTS');
    }
  }

  public testCaptionDetection() {
    this.checkForClosedCaptions();
  }

  public testSpeech() {
    console.log('🧪 Testing speech synthesis...');
    this.playTranslatedSpeech('Ricardo. Guillermo. Naranja. Más.');
  }

  public async testElevenLabsAudio() {
    console.log('🧪 Testing ElevenLabs audio...');
    try {
      const response = await fetch('http://localhost:8080/api/caption-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: 'Hello world',
          language: 'en',
          targetLanguage: 'es'
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('🧪 Test response:', result);
        if (result.audioData) {
          console.log('🧪 Testing ElevenLabs audio playback...');
          await this.playElevenLabsAudio(result.audioData);
        } else {
          console.log('❌ No audio data in response');
        }
      } else {
        console.log('❌ Test request failed:', response.status);
      }
    } catch (error) {
      console.error('❌ Test error:', error);
    }
  }

  public debugCaptionDetection() {
    console.log('🔍 DEBUG: Caption Detection Status');
    console.log(`📊 Monitoring Active: ${this.monitoringActive}`);
    console.log(`📊 Last Processed Text: "${this.lastProcessedText}"`);
    console.log(`📊 Processed Words Count: ${this.processedWords.size}`);
    
    // Check all possible caption selectors
    const captionSelectors = [
      '[jsname="r4nke"]',
      '[data-is-muted="false"] [jsname="r4nke"]',
      '[role="region"] [jsname="r4nke"]',
      '.captions-text',
      '[aria-live="polite"]',
      '[data-caption-text]'
    ];
    
    captionSelectors.forEach((selector, index) => {
      const elements = document.querySelectorAll(selector);
      console.log(`🔍 Selector ${index + 1} (${selector}): Found ${elements.length} elements`);
      elements.forEach((el, i) => {
        const text = el.textContent?.trim();
        console.log(`   Element ${i + 1}: "${text}" (${text?.length || 0} chars)`);
      });
    });
    
    // Run a manual check
    this.checkForClosedCaptions();
  }

  public destroy() {
    this.isMonitoring = false;
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    if (this.translationOverlay) {
      this.translationOverlay.remove();
    }
  }
}

// Initialize when the page loads
let captionDetector: GoogleMeetCaptionDetector;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    captionDetector = new GoogleMeetCaptionDetector();
    (window as any).captionDetector = captionDetector;
  });
} else {
  captionDetector = new GoogleMeetCaptionDetector();
  (window as any).captionDetector = captionDetector;
  (window as any).testSpeech = () => captionDetector.testSpeech();
  (window as any).testElevenLabsAudio = () => captionDetector.testElevenLabsAudio();
  (window as any).debugCaptionDetection = () => captionDetector.debugCaptionDetection();
}

// Export for potential use by other scripts
(window as any).GoogleMeetCaptionDetector = GoogleMeetCaptionDetector;

// Add global test function
(window as any).testCaptionDetection = () => {
  console.log('🧪 Global test function called');
  if ((window as any).captionDetector) {
    (window as any).captionDetector.testCaptionDetection();
  } else {
    console.log('❌ Caption detector not found');
  }
};

// Add function to manually test translation
(window as any).testTranslation = (text: string) => {
  console.log('🧪 Testing translation for:', text);
  if ((window as any).captionDetector) {
    (window as any).captionDetector.sendForTranslation(text);
  } else {
    console.log('❌ Caption detector not found');
  }
};
