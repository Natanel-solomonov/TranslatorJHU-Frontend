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
  private wordBuffer = ''; // Buffer to accumulate words before translating
  private bufferTimeout: number | null = null; // Timeout for word buffer
  private processedTexts = new Set<string>(); // Track processed texts to prevent duplicates
  private skippedTexts = new Set<string>(); // Track permanently skipped texts to prevent infinite loops
  private isFirstCaption = true; // Track if this is the first caption after starting
  private lastSeenCaptionElement: HTMLElement | null = null; // Track the last seen caption element

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
    this.processedTexts.clear(); // Reset processed texts
    this.skippedTexts.clear(); // Reset skipped texts
    this.isFirstCaption = true; // Reset first caption flag
    this.lastProcessedText = ''; // Reset last processed text
    this.lastSeenCaptionElement = null; // Reset last seen caption element

    this.setupMutationObserver();
    this.checkInterval = window.setInterval(() => {
      if (this.monitoringActive) {
        this.checkForClosedCaptions();
      }
    }, 250); // 250ms for very fast response to new lines
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
    
    // Clear word buffer and timeout
    if (this.bufferTimeout) {
      clearTimeout(this.bufferTimeout);
      this.bufferTimeout = null;
    }
    this.wordBuffer = '';
    this.processedTexts.clear();
    this.skippedTexts.clear();
    this.isFirstCaption = true;
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
        }, 2000); // Increased debounce to 2 seconds
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
    
    // Try multiple selectors for Google Meet captions (updated for 2024)
    const captionSelectors = [
      // ACTUAL selector for Google Meet captions (provided by user)
      '#yDmH0d > c-wiz > div > div > div.TKU8Od > div.crqnQb > div > div.fJsklc.nulMpf.Didmac.G03iKb.hLkVuf > div > div > div.DtJ7e > div > div > div.nMcdL.bj4p3b > div.ygicle.VbkSUe',
      // Shorter version of the same selector
      'div.ygicle.VbkSUe',
      'div.nMcdL.bj4p3b > div.ygicle.VbkSUe',
      // Fallback selectors
      '[jsname="tgaKEf"]',
      '[jsname="tgaKEf"] span',
      '[jsname="tgaKEf"] div',
      '[jsname="r4nke"] span[jsname="r4nke"]',
      '[jsname="r4nke"] div[jsname="r4nke"]',
      'span[jsname="r4nke"]',
      'div[jsname="r4nke"]'
    ];
    
    // Parent container selector for all caption lines (provided by user)
    const parentContainerSelector = '#yDmH0d > c-wiz > div > div > div.TKU8Od > div.crqnQb > div > div.fJsklc.nulMpf.Didmac.G03iKb.hLkVuf > div > div > div.DtJ7e > div > div';
    
    try {
      let captionContainer = null;
      let foundText = '';
      
      // First, try to find the parent container and get the newest child
      const parentContainer = document.querySelector(parentContainerSelector);
      if (parentContainer) {
        // Look for caption elements within the parent container
        const childSelectors = [
          'div.nMcdL.bj4p3b > div.ygicle.VbkSUe',
          'div.ygicle.VbkSUe',
          'div[class*="ygicle"]',
          'div[class*="VbkSUe"]'
        ];
        
        for (const childSelector of childSelectors) {
          const childElements = parentContainer.querySelectorAll(childSelector);
          
          // Get the LAST (newest) child element
          for (let i = childElements.length - 1; i >= 0; i--) {
            const element = childElements[i];
            const text = element.textContent?.trim();
            
            if (text && text.length >= 3 && this.isValidClosedCaption(text)) {
              captionContainer = element;
              foundText = text;
              break;
            }
          }
          
          if (foundText) break;
        }
      }
      
      // If parent approach didn't work, try each selector until we find captions (silent search)
      if (!foundText) {
        for (const selector of captionSelectors) {
          const elements = document.querySelectorAll(selector);
          
          // For multiple people talking, get the LAST (newest) caption element
          for (let i = elements.length - 1; i >= 0; i--) {
            const element = elements[i];
            const text = element.textContent?.trim();
            
            if (text && text.length >= 3 && this.isValidClosedCaption(text)) {
              captionContainer = element;
              foundText = text;
              break;
            }
          }
          
          if (foundText) break;
        }
      }
      
      // If no captions found with specific selectors, try a broader search for any text that looks like speech
      if (!foundText) {
        // Try to find any element with caption-related classes
        const captionElements = document.querySelectorAll('div[class*="ygicle"], div[class*="VbkSUe"], div[class*="nMcdL"], div[class*="bj4p3b"]');
        
        // For multiple people talking, get the LAST (newest) caption element
        for (let i = captionElements.length - 1; i >= 0; i--) {
          const element = captionElements[i];
          const text = element.textContent?.trim();
          if (text && text.length >= 3 && text.length <= 200 && this.isValidClosedCaption(text)) {
            captionContainer = element;
            foundText = text;
            break;
          }
        }
      }
      
      if (captionContainer && foundText) {
        // On first caption after starting monitoring, set baseline
        if (this.isFirstCaption) {
          this.lastProcessedText = foundText;
          this.isFirstCaption = false;
          console.log(`🎯 BASELINE SET: "${foundText}"`);
          return; // Don't process the baseline text
        }
        
        // Check if this text has been permanently skipped
        if (this.skippedTexts.has(foundText)) {
          console.log(`🚫 PERMANENTLY SKIPPED: "${foundText}"`);
          return; // Skip this text permanently
        }
        
        // Process new caption elements
        if (foundText !== this.lastProcessedText) {
          console.log(`🎯 NEW CAPTION DETECTED: "${foundText}"`);
          
          
          // Check if this is the same element (same person continuing) or different element (new person)
          const isSameElement = captionContainer === this.lastSeenCaptionElement;
          
          if (isSameElement) {
            // Same person - use word buffer logic with length condition
            console.log(`🔄 SAME SPEAKER CONTINUING: "${foundText}"`);
            
            // Only process if text is longer than what we've seen (new words added)
            if (foundText.length > this.lastProcessedText.length) {
              console.log(`🆕 NEW WORDS ADDED: "${foundText}"`);
              
              // Extract only the NEW words that were added
              const newWords = this.extractNewWords(this.lastProcessedText, foundText);
              
              if (newWords && newWords.trim().length > 0) {
                console.log(`🆕 NEW WORDS EXTRACTED: "${newWords}"`);
                
                // Update last processed text first
                this.lastProcessedText = foundText;
                
                // Add only the new words to buffer
                this.addToWordBuffer(newWords);
              } else {
                // If no new words extracted, just update the last processed text
                this.lastProcessedText = foundText;
              }
            }
          } else {
            // Different person - process entire caption without length condition
            console.log(`🆕 NEW SPEAKER: "${foundText}"`);
            
            // Update last processed text
            this.lastProcessedText = foundText;
            
            // Process the entire new caption
            this.addToWordBuffer(foundText);
          }
          
          // Update the last seen caption element AFTER processing
          this.lastSeenCaptionElement = captionContainer as HTMLElement;
        }
      }
    } catch (error) {
      console.error('Caption detection error:', error);
    }
  }



  private addToWordBuffer(text: string) {
    // Check if this text has been permanently skipped
    if (this.skippedTexts.has(text)) {
      console.log(`🚫 PERMANENTLY SKIPPED: "${text}"`);
      return; // Skip this text permanently
    }
    
    // No content filtering - process all new content
    
    // Only process if this is actually new content
    if (this.processedTexts.has(text)) {
      console.log(`⚠️ SKIPPING DUPLICATE: "${text}"`);
      return; // Already processed, don't process again
    }
    
    // Add new words to the buffer (accumulate them)
    if (this.wordBuffer) {
      this.wordBuffer += ' ' + text;
    } else {
      this.wordBuffer = text;
    }
    
    console.log(`📝 WORD BUFFER: "${this.wordBuffer}"`);
    
    // Clear existing timeout
    if (this.bufferTimeout) {
      clearTimeout(this.bufferTimeout);
    }
    
    // Set timeout to process buffer after 2 seconds of no new words
    this.bufferTimeout = window.setTimeout(() => {
      this.processWordBuffer();
    }, 2000);
  }

  private processWordBuffer() {
    if (this.wordBuffer.trim().length > 0) {
      // Check if this text has been permanently skipped
      if (this.skippedTexts.has(this.wordBuffer)) {
        console.log(`🚫 PERMANENTLY SKIPPED: "${this.wordBuffer}"`);
        this.wordBuffer = '';
        return;
      }
      
      // No content filtering - process all new content
      
      // Check if we've already processed this exact text
      if (this.processedTexts.has(this.wordBuffer)) {
        console.log(`⚠️ SKIPPING DUPLICATE: "${this.wordBuffer}"`);
        this.wordBuffer = '';
        return;
      }
      
      console.log(`🔄 PROCESSING BUFFER: "${this.wordBuffer}"`);
      
      // Add throttling to prevent too many requests
      const now = Date.now();
      if (now - this.lastTranslationTime < 2000) { // 2 second minimum between translations
        // Reschedule if too soon
        this.bufferTimeout = window.setTimeout(() => {
          this.processWordBuffer();
        }, 2000);
        return;
      }
      this.lastTranslationTime = now;
      
      // Mark this text as processed BEFORE sending to prevent race conditions
      this.processedTexts.add(this.wordBuffer);
      
      // Process the buffered words
      this.sendForTranslation(this.wordBuffer);
      
      // Clear the buffer to prevent reprocessing
      this.wordBuffer = '';
    }
  }

  private extractNewWords(previousText: string, currentText: string): string {
    if (!previousText) {
      return currentText; // If no previous text, return the entire current text
    }

    // Normalize text by removing punctuation for comparison
    const normalizeText = (text: string) => text.replace(/[.,!?;:]/g, '').toLowerCase().trim();
    
    const normalizedPrevious = normalizeText(previousText);
    const normalizedCurrent = normalizeText(currentText);
    
    // Check if current text is actually longer (has new words)
    if (normalizedCurrent.length <= normalizedPrevious.length) {
      return ''; // No new words
    }
    
    // Check if current text starts with previous text (is an extension)
    if (!normalizedCurrent.startsWith(normalizedPrevious)) {
      return ''; // Not an extension, might be a completely different caption
    }
    
    // Extract the new part from the original text (preserving punctuation)
    const newPart = currentText.substring(previousText.length).trim();
    
    // Only return if we have meaningful new content (at least 2 characters)
    if (newPart.length >= 2) {
      return newPart;
    }
    
    return '';
  }

  private isValidClosedCaption(text: string): boolean {
    if (!text || text.trim().length === 0) {
      return false;
    }

    // Very simple validation - just check for basic speech patterns
    const hasLetters = /[a-zA-Z]/.test(text);
    const isLongEnough = text.length >= 3; // Very short minimum
    const notJustNumbers = !/^[0-9\s.,!?\-']+$/.test(text); // Not just numbers and punctuation
    
    return hasLetters && isLongEnough && notJustNumbers;
  }



  private async sendForTranslation(text: string) {
    if (!this.isConnected) return;

    // Get user's voice ID from storage
    let voiceId = null;
    try {
      const userData = await chrome.storage.local.get(['currentUser']);
      if (userData.currentUser && userData.currentUser.voiceId) {
        voiceId = userData.currentUser.voiceId;
      }
    } catch (error) {
      // Silent error handling
    }

    try {
      const response = await fetch('http://localhost:8080/api/caption-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          language: 'en',
          targetLanguage: this.targetLanguage,
          voiceId: voiceId
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        console.log(`Translation: "${result.originalText || text}" → "${result.translatedText}"`);
        
        this.displayTranslation({
          originalText: result.originalText || text,
          translatedText: result.translatedText || 'Translation failed',
          confidence: result.confidence || 0.8
        });
        
        // Play ElevenLabs TTS audio if available, otherwise fallback to browser TTS
        if (result.translatedText && result.translatedText !== 'Translation failed') {
          if (result.audioData && result.audioData !== null && result.audioData.length > 0) {
            this.playElevenLabsAudio(result.audioData);
          } else {
            this.playTranslatedSpeech(result.translatedText);
          }
        }
      } else {
        this.displayTranslation({
          originalText: text,
          translatedText: `[Translated: ${text}]`,
          confidence: 0.5
        });
      }
    } catch (error) {
      // Silent error handling
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
      utterance.onerror = (event) => {
        console.error('🔊 Speech error:', event.error);
        // Don't show "interrupted" as an error if it's just normal cancellation
        if (event.error !== 'interrupted') {
          console.error('🔊 Speech synthesis error:', event.error);
        }
      };
      
    } else {
      console.warn('Speech synthesis not supported in this browser');
    }
  }

  private async playElevenLabsAudio(audioData: any) {
    // Check if audio data is valid
    if (!audioData || audioData === null || audioData.length === 0) {
      console.log('⚠️ No valid audio data provided, falling back to browser TTS');
      return;
    }
    
    
    console.log(`\n🔊 ELEVENLABS AUDIO PLAYBACK:`);
    console.log(`📊 Audio data type: ${typeof audioData}`);
    console.log(`📊 Audio data length: ${audioData.length} items`);
    console.log(`📊 First 10 items: ${JSON.stringify(audioData.slice(0, 10))}...`);
    
    try {
      let audioBuffer: ArrayBuffer;
      
      // Check if audioData is an array of numbers (from backend) or a base64 string
      if (Array.isArray(audioData)) {
        // Convert array of numbers to ArrayBuffer
        console.log(`🔄 Converting number array to ArrayBuffer...`);
        audioBuffer = new ArrayBuffer(audioData.length);
        const view = new Uint8Array(audioBuffer);
        
        for (let i = 0; i < audioData.length; i++) {
          view[i] = audioData[i];
        }
        console.log(`📊 ArrayBuffer created: ${audioBuffer.byteLength} bytes`);
      } else {
        // Convert base64 audio data to ArrayBuffer
        console.log(`🔄 Converting base64 to ArrayBuffer...`);
        const binaryString = atob(audioData);
        console.log(`📊 Binary string length: ${binaryString.length} bytes`);
        
        audioBuffer = new ArrayBuffer(binaryString.length);
        const view = new Uint8Array(audioBuffer);
        
        for (let i = 0; i < binaryString.length; i++) {
          view[i] = binaryString.charCodeAt(i);
        }
        console.log(`📊 ArrayBuffer created: ${audioBuffer.byteLength} bytes`);
      }

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
