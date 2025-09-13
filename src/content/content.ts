// Content script for meeting platforms (Zoom, Google Meet, Teams)
import { AudioCaptureService } from "../services/audioCapture";

interface ContentMessage {
  type: string;
  data?: any;
}

class ContentScript {
  private audioCapture: AudioCaptureService | null = null;
  private captionsOverlay: HTMLIFrameElement | null = null;
  // private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    // Wait for page to be fully loaded
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.setup());
    } else {
      this.setup();
    }
  }

  private async setup() {
    console.log(
      "TranslatorJHU content script loaded on:",
      window.location.href
    );

    // Detect meeting platform
    const platform = this.detectPlatform();
    console.log("Detected platform:", platform);

    // Listen for messages from background script and popup
    chrome.runtime.onMessage.addListener(
      (message: ContentMessage, _sender, sendResponse) => {
        this.handleMessage(message, sendResponse);
        return true;
      }
    );

    // Initialize audio capture
    this.audioCapture = new AudioCaptureService();

    // Create captions overlay
    this.createCaptionsOverlay();

    // this.isInitialized = true;
  }

  private detectPlatform(): string {
    const hostname = window.location.hostname;

    if (hostname.includes("meet.google.com")) {
      return "google-meet";
    } else if (hostname.includes("zoom.us")) {
      return "zoom";
    } else if (hostname.includes("teams.microsoft.com")) {
      return "teams";
    }

    return "unknown";
  }

  private async handleMessage(
    message: ContentMessage,
    sendResponse: (response?: any) => void
  ) {
    console.log("Content script received message:", message.type);
    
    switch (message.type) {
      case "startAudioCapture":
        try {
          await this.startAudioCapture();
          sendResponse({ success: true });
        } catch (error) {
          console.error("Failed to start audio capture:", error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
        }
        return true; // Keep message channel open

      case "stopAudioCapture":
        try {
          this.stopAudioCapture();
          sendResponse({ success: true });
        } catch (error) {
          console.error("Failed to stop audio capture:", error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
        }
        return true; // Keep message channel open

      case "captureStarted":
        // Tab capture started from background
        console.log("Tab capture started with stream:", message.data?.streamId);
        break;

      case "captureStopped":
        // Tab capture stopped from background
        console.log("Tab capture stopped");
        break;

      case "showCaptions":
        this.showCaptions(message.data);
        sendResponse({ success: true });
        return true;

      case "hideCaptions":
        this.hideCaptions();
        sendResponse({ success: true });
        return true;

      case "transcription":
        console.log("Content script: Received transcription:", message.data);
        // Forward to captions overlay
        this.forwardToCaptionsOverlay(message);
        break;
        
      case "translation":
        console.log("Content script: Received translation:", message.data);
        // Forward to captions overlay
        this.forwardToCaptionsOverlay(message);
        break;

      case "ping":
        sendResponse({ pong: true, platform: this.detectPlatform() });
        return true;

      default:
        console.log("Unknown message type:", message.type);
        sendResponse({ success: false, error: "Unknown message type" });
        return true;
    }
  }

  private async startAudioCapture() {
    if (!this.audioCapture) {
      console.error("Audio capture not initialized");
      throw new Error("Audio capture not initialized");
    }

    try {
      console.log("Initializing audio capture...");
      await this.audioCapture.initialize();
      
      console.log("Starting audio recording...");
      await this.audioCapture.startRecording();

      // Set up audio data streaming to background
      this.audioCapture.onAudioData = (audioData: ArrayBuffer) => {
        console.log("Content script: Sending audio data to background:", audioData.byteLength, "bytes");
        
        // Convert ArrayBuffer to Uint8Array for Chrome message passing
        const uint8Array = new Uint8Array(audioData);
        console.log("Content script: Converted to Uint8Array:", uint8Array.length, "bytes");
        
        chrome.runtime.sendMessage({
          type: "sendAudioData",
          data: Array.from(uint8Array), // Convert to regular array for serialization
        }).then(() => {
          console.log("Content script: Audio data sent successfully");
        }).catch(error => {
          console.error("Content script: Failed to send audio data:", error);
        });
      };

      console.log("Audio capture started successfully");
    } catch (error) {
      console.error("Failed to start audio capture:", error);
      // Show user-friendly error message
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("denied")) {
        throw new Error("Microphone access denied. Please allow microphone access in your browser settings and try again.");
      } else if (errorMessage.includes("not found")) {
        throw new Error("No microphone found. Please connect a microphone and try again.");
      } else {
        throw error;
      }
    }
  }

  private stopAudioCapture() {
    if (this.audioCapture) {
      this.audioCapture.stopRecording();
      console.log("Audio capture stopped");
    }
  }

  private createCaptionsOverlay() {
    // Create iframe for captions overlay
    this.captionsOverlay = document.createElement("iframe");
    this.captionsOverlay.src = chrome.runtime.getURL("captions-overlay.html");
    this.captionsOverlay.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      width: 600px;
      height: 200px;
      border: none;
      background: transparent;
      z-index: 10000;
      pointer-events: none;
      border-radius: 12px;
    `;
    this.captionsOverlay.style.display = "none";

    document.body.appendChild(this.captionsOverlay);
  }

  private showCaptions(data: any) {
    if (this.captionsOverlay) {
      this.captionsOverlay.style.display = "block";
      this.forwardToCaptionsOverlay({ type: "showCaptions", data });
    }
  }

  private hideCaptions() {
    if (this.captionsOverlay) {
      this.captionsOverlay.style.display = "none";
    }
  }

  private forwardToCaptionsOverlay(message: ContentMessage) {
    if (this.captionsOverlay && this.captionsOverlay.contentWindow) {
      this.captionsOverlay.contentWindow.postMessage(message, "*");
    }
  }

  // Detect meeting state changes
  // private observeMeetingState() {
  //   const platform = this.detectPlatform();

  //   switch (platform) {
  //     case "google-meet":
  //       this.observeGoogleMeet();
  //       break;
  //     case "zoom":
  //       this.observeZoom();
  //       break;
  //     case "teams":
  //       this.observeTeams();
  //       break;
  //   }
  // }

  // private observeGoogleMeet() {
  //   // Monitor Google Meet UI for meeting join/leave events
  //   const observer = new MutationObserver((_mutations) => {
  //     // Look for meeting controls to detect join/leave
  //     const joinButton = document.querySelector('[data-call-to-action="join"]');
  //     const leaveButton = document.querySelector(
  //       '[data-call-to-action="hangup"]'
  //     );

  //     if (joinButton) {
  //       this.notifyMeetingState("meeting-available");
  //     } else if (leaveButton) {
  //       this.notifyMeetingState("meeting-active");
  //     }
  //   });

  //   observer.observe(document.body, {
  //     childList: true,
  //     subtree: true,
  //   });
  // }

  // private observeZoom() {
  //   // Monitor Zoom UI changes
  //   const observer = new MutationObserver((_mutations) => {
  //     // Zoom-specific selectors
  //     const inMeeting = document.querySelector(".meeting-client-main");

  //     if (inMeeting) {
  //       this.notifyMeetingState("meeting-active");
  //     }
  //   });

  //   observer.observe(document.body, {
  //     childList: true,
  //     subtree: true,
  //   });
  // }

  // private observeTeams() {
  //   // Monitor Teams UI changes
  //   const observer = new MutationObserver((_mutations) => {
  //     // Teams-specific selectors
  //     const inCall = document.querySelector(
  //       '[data-tid="calling-meeting-stage"]'
  //     );

  //     if (inCall) {
  //       this.notifyMeetingState("meeting-active");
  //     }
  //   });

  //   observer.observe(document.body, {
  //     childList: true,
  //     subtree: true,
  //   });
  // }

  // private notifyMeetingState(state: string) {
  //   chrome.runtime.sendMessage({
  //     type: "meetingStateChanged",
  //     data: {
  //       state,
  //       platform: this.detectPlatform(),
  //       url: window.location.href,
  //     },
  //   });
  // }
}

// Initialize content script
new ContentScript();
