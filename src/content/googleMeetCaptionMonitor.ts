// Google Meet Caption Monitor
// Extracts captions from Google Meet and sends them for translation

// import { API_ENDPOINTS } from '../config/environment';

class GoogleMeetCaptionMonitor {
  private isMonitoring = false;
  private lastProcessedText = '';
  private translationOverlay: HTMLElement | null = null;
  private targetLanguage = 'es'; // Default to Spanish
  private isConnected = false;

  constructor() {
    this.init();
  }

  private init() {
    console.log('🎯 Google Meet Caption Monitor initialized');
    console.log('🌐 Current URL:', window.location.href);
    console.log('📄 Document ready state:', document.readyState);
    this.createTranslationOverlay();
    this.isConnected = true; // Assume connected
    this.startCaptionMonitoring();
    
    // Show test overlay after 3 seconds to verify it's working
    setTimeout(() => {
      this.showTestTranslation();
    }, 3000);
  }

  private createTranslationOverlay() {
    // Create a floating overlay for translations
    const overlay = document.createElement('div');
    overlay.id = 'translatorjhu-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 300px;
      max-height: 200px;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 15px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: none;
      overflow-y: auto;
      backdrop-filter: blur(10px);
    `;

    // Add header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    `;
    
    const title = document.createElement('div');
    title.textContent = '🌐 Live Translation';
    title.style.fontWeight = 'bold';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: white;
      font-size: 18px;
      cursor: pointer;
      padding: 0;
      width: 20px;
      height: 20px;
    `;
    closeBtn.onclick = () => this.hideOverlay();
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    overlay.appendChild(header);

    // Add content area
    const content = document.createElement('div');
    content.id = 'translatorjhu-content';
    content.style.cssText = `
      min-height: 40px;
      word-wrap: break-word;
    `;
    overlay.appendChild(content);

    document.body.appendChild(overlay);
    this.translationOverlay = overlay;
  }


  private displayTranslation(data: any) {
    if (!this.translationOverlay) return;

    const content = this.translationOverlay.querySelector('#translatorjhu-content');
    if (!content) return;

    if (data.translatedText) {
      content.innerHTML = `
        <div style="margin-bottom: 8px; color: #ccc; font-size: 12px;">
          Original: "${data.originalText || ''}"
        </div>
        <div style="color: #fff; font-weight: 500;">
          ${data.translatedText}
        </div>
      `;
      this.showOverlay();
    }
  }

  private showOverlay() {
    if (this.translationOverlay) {
      this.translationOverlay.style.display = 'block';
    }
  }

  private hideOverlay() {
    if (this.translationOverlay) {
      this.translationOverlay.style.display = 'none';
    }
  }

  private startCaptionMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    console.log('👀 Starting Google Meet caption monitoring...');

    // Monitor for caption elements
    const observer = new MutationObserver((_mutations) => {
      this.checkForCaptions();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Also check periodically for captions
    setInterval(() => {
      this.checkForCaptions();
    }, 1000);
  }

  private checkForCaptions() {
    // Focus ONLY on actual closed captions, not UI elements
    const captionSelectors = [
      // Google Meet closed caption specific selectors
      '[data-caption-text]',
      '[jsname="r4nke"]', // Main caption container
      '.captions-text',
      '[aria-live="polite"]',
      // Look specifically for caption text elements
      'div[jsname="r4nke"] div[jsname="r4nke"]', // Nested caption divs
      'div[aria-live="polite"] div', // Live region divs
      'div[data-caption-text]', // Caption text divs
      'span[data-caption-text]' // Caption text spans
    ];

    // Log every 10th check to see what's happening
    if (Math.random() < 0.1) {
      console.log('🔍 Checking for closed captions...');
      console.log('🔍 Total elements found:', document.querySelectorAll('*').length);
    }
    
    for (const selector of captionSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        console.log(`🔍 Caption selector "${selector}" found ${elements.length} elements`);
        // Log the text content of found elements
        elements.forEach((el, index) => {
          if (index < 3) { // Only log first 3 to avoid spam
            console.log(`  Element ${index}:`, el.textContent?.trim());
          }
        });
      }
      for (const element of elements) {
        this.processCaptionElement(element);
      }
    }
  }

  private processCaptionElement(element: Element) {
    const text = element.textContent?.trim();
    if (!text || text === this.lastProcessedText || text.length < 3) {
      return;
    }

    // Check if this looks like a caption (not UI text)
    if (this.isLikelyCaption(text)) {
      console.log('📝 Found Google Meet caption:', text);
      console.log('🎯 Element:', element);
      this.lastProcessedText = text;
      this.sendForTranslation(text);
    }
  }


  private isLikelyCaption(text: string): boolean {
    // Filter out UI text and focus on actual speech captions - be VERY strict
    const uiKeywords = [
      'mute', 'unmute', 'camera', 'chat', 'participants', 'settings',
      'leave', 'join', 'share', 'record', 'captions', 'transcript',
      'turn on', 'turn off', 'click', 'button', 'menu', 'option',
      'copy', 'link', 'add', 'others', 'ready', 'close', 'person_add',
      'content_copy', 'meet.google.com', 'join now', 'present', 'stop',
      'end call', 'more options', 'your meeting', 'meeting', 'call'
    ];

    // Check if text contains UI keywords
    const lowerText = text.toLowerCase();
    if (uiKeywords.some(keyword => lowerText.includes(keyword))) {
      console.log('🚫 Filtered out UI text:', text);
      return false;
    }

    // Check if text is too short (must be at least 10 characters for real speech)
    if (text.length < 10) {
      console.log('🚫 Text too short:', text);
      return false;
    }

    // Check if text looks like a sentence (contains spaces and common words)
    const wordCount = text.split(' ').length;
    if (wordCount < 3) {
      console.log('🚫 Not enough words:', text);
      return false;
    }

    // Check if text contains only letters, spaces, and basic punctuation (like speech)
    if (!/^[a-zA-Z\s.,!?\-']+$/.test(text)) {
      console.log('🚫 Contains non-speech characters:', text);
      return false;
    }

    // Check if text starts with lowercase (likely speech) vs uppercase (likely UI)
    if (/^[A-Z]/.test(text) && text.length < 20) {
      console.log('🚫 Starts with uppercase (likely UI):', text);
      return false;
    }

    console.log('✅ Valid caption text:', text);
    return true;
  }

  private async sendForTranslation(text: string) {
    if (!this.isConnected) {
      console.log('⚠️ Not connected to backend, skipping translation');
      return;
    }

    try {
      console.log('📤 Sending caption for translation:', text);
      
      // Send directly to backend API
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

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Translation received:', result);
        
        // Display the translation
        this.displayTranslation({
          originalText: result.originalText,
          translatedText: result.translatedText,
          confidence: result.confidence
        });
      } else {
        console.error('❌ Translation failed:', response.statusText);
      }
    } catch (error) {
      console.error('❌ Error sending translation request:', error);
    }
  }


  private showTestTranslation() {
    console.log('🧪 Showing test translation overlay');
    this.displayTranslation({
      originalText: "Hello, this is a test of the translation system",
      translatedText: "Hola, esta es una prueba del sistema de traducción",
      confidence: 0.95
    });
    
    // Hide test after 5 seconds
    setTimeout(() => {
      this.hideOverlay();
    }, 5000);
  }

  // Test method to manually trigger caption detection
  public testCaptionDetection() {
    console.log('🧪 Manual caption detection test');
    this.checkForCaptions();
  }

  public setTargetLanguage(language: string) {
    this.targetLanguage = language;
    console.log('🌐 Target language set to:', language);
  }

  public destroy() {
    this.isMonitoring = false;
    if (this.translationOverlay) {
      this.translationOverlay.remove();
    }
  }
}

// Initialize when the page loads
let captionMonitor: GoogleMeetCaptionMonitor;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    captionMonitor = new GoogleMeetCaptionMonitor();
    (window as any).captionMonitor = captionMonitor;
  });
} else {
  captionMonitor = new GoogleMeetCaptionMonitor();
  (window as any).captionMonitor = captionMonitor;
}

// Export for potential use by other scripts
(window as any).GoogleMeetCaptionMonitor = GoogleMeetCaptionMonitor;

// Add global test function
(window as any).testCaptionDetection = () => {
  console.log('🧪 Global test function called');
  if ((window as any).captionMonitor) {
    (window as any).captionMonitor.testCaptionDetection();
  } else {
    console.log('❌ Caption monitor not found');
  }
};
