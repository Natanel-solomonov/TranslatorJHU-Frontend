// Content script for meeting platforms (Zoom, Google Meet, Teams)
import { AudioCaptureService } from "../services/audioCapture";

interface ContentMessage {
  type: string;
  data?: any;
}

class ContentScript {
  private audioCapture: AudioCaptureService | null = null;
  private captionsOverlay: HTMLIFrameElement | null = null;
  private isInitialized = false;

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
      (message: ContentMessage, sender, sendResponse) => {
        this.handleMessage(message, sendResponse);
        return true;
      }
    );

    // Initialize audio capture
    this.audioCapture = new AudioCaptureService();

    // Create captions overlay
    this.createCaptionsOverlay();

    this.isInitialized = true;
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
    switch (message.type) {
      case "startAudioCapture":
        await this.startAudioCapture();
        sendResponse({ success: true });
        break;

      case "stopAudioCapture":
        this.stopAudioCapture();
        sendResponse({ success: true });
        break;

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
        break;

      case "hideCaptions":
        this.hideCaptions();
        break;

      case "transcription":
      case "translation":
        // Forward to captions overlay
        this.forwardToCaptionsOverlay(message);
        break;

      case "ping":
        sendResponse({ pong: true, platform: this.detectPlatform() });
        break;

      default:
        console.log("Unknown message type:", message.type);
    }
  }

  private async startAudioCapture() {
    if (!this.audioCapture) {
      console.error("Audio capture not initialized");
      return;
    }

    try {
      await this.audioCapture.initialize();
      await this.audioCapture.startRecording();

      // Set up audio data streaming to background
      this.audioCapture.onAudioData = (audioData: ArrayBuffer) => {
        chrome.runtime.sendMessage({
          type: "sendAudioData",
          data: audioData,
        });
      };

      console.log("Audio capture started");
    } catch (error) {
      console.error("Failed to start audio capture:", error);
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
  private observeMeetingState() {
    const platform = this.detectPlatform();

    switch (platform) {
      case "google-meet":
        this.observeGoogleMeet();
        break;
      case "zoom":
        this.observeZoom();
        break;
      case "teams":
        this.observeTeams();
        break;
    }
  }

  private observeGoogleMeet() {
    // Monitor Google Meet UI for meeting join/leave events
    const observer = new MutationObserver((mutations) => {
      // Look for meeting controls to detect join/leave
      const joinButton = document.querySelector('[data-call-to-action="join"]');
      const leaveButton = document.querySelector(
        '[data-call-to-action="hangup"]'
      );

      if (joinButton) {
        this.notifyMeetingState("meeting-available");
      } else if (leaveButton) {
        this.notifyMeetingState("meeting-active");
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private observeZoom() {
    // Monitor Zoom UI changes
    const observer = new MutationObserver((mutations) => {
      // Zoom-specific selectors
      const inMeeting = document.querySelector(".meeting-client-main");

      if (inMeeting) {
        this.notifyMeetingState("meeting-active");
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private observeTeams() {
    // Monitor Teams UI changes
    const observer = new MutationObserver((mutations) => {
      // Teams-specific selectors
      const inCall = document.querySelector(
        '[data-tid="calling-meeting-stage"]'
      );

      if (inCall) {
        this.notifyMeetingState("meeting-active");
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private notifyMeetingState(state: string) {
    chrome.runtime.sendMessage({
      type: "meetingStateChanged",
      data: {
        state,
        platform: this.detectPlatform(),
        url: window.location.href,
      },
    });
  }
}

// Initialize content script
new ContentScript();
