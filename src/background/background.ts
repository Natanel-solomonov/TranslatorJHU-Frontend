// Background service worker for Chrome Extension
import { WebSocketService } from "../services/websocket";

interface ExtensionMessage {
  type: string;
  data?: any;
}

interface TabInfo {
  id: number;
  url: string;
  title: string;
}

class BackgroundService {
  private wsService: WebSocketService | null = null;
  private activeTab: TabInfo | null = null;
  private isCapturing = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    // Listen for extension messages
    chrome.runtime.onMessage.addListener(
      (message: ExtensionMessage, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
        return true; // Keep the message channel open for async responses
      }
    );

    // Monitor tab updates for meeting detection
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === "complete" && tab.url) {
        this.checkMeetingTab(tab);
      }
    });

    // Initialize WebSocket connection
    this.initializeWebSocket();
  }

  private async initializeWebSocket() {
    this.wsService = new WebSocketService("ws://localhost:8080");

    this.wsService.onConnect(() => {
      console.log("Background: WebSocket connected");
      this.broadcastToTabs({ type: "websocket:connected" });
    });

    this.wsService.onDisconnect(() => {
      console.log("Background: WebSocket disconnected");
      this.broadcastToTabs({ type: "websocket:disconnected" });
    });

    this.wsService.onTranscription((data) => {
      this.broadcastToTabs({ type: "transcription", data });
    });

    this.wsService.onTranslation((data) => {
      this.broadcastToTabs({ type: "translation", data });
    });

    this.wsService.connect();
  }

  private async handleMessage(
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ) {
    switch (message.type) {
      case "startCapture":
        await this.startTabCapture(message.data.tabId);
        sendResponse({ success: true });
        break;

      case "stopCapture":
        await this.stopTabCapture();
        sendResponse({ success: true });
        break;

      case "getActiveTabs":
        const tabs = await this.getMeetingTabs();
        sendResponse({ tabs });
        break;

      case "sendAudioData":
        if (this.wsService && message.data) {
          this.wsService.sendAudioData(message.data);
        }
        break;

      case "websocket:send":
        if (this.wsService) {
          this.wsService.send(message.data.type, message.data.payload);
        }
        break;

      default:
        console.log("Unknown message type:", message.type);
    }
  }

  private async startTabCapture(tabId: number) {
    try {
      // Request tab capture permission
      const stream = await chrome.tabCapture.capture({
        audio: true,
        video: false,
      });

      if (stream) {
        this.isCapturing = true;

        // Send capture start message to content script
        chrome.tabs.sendMessage(tabId, {
          type: "captureStarted",
          data: { streamId: stream.id },
        });

        console.log("Tab capture started for tab:", tabId);
      }
    } catch (error) {
      console.error("Failed to start tab capture:", error);
    }
  }

  private async stopTabCapture() {
    if (this.isCapturing && this.activeTab) {
      // Send stop message to content script
      chrome.tabs.sendMessage(this.activeTab.id, {
        type: "captureStopped",
      });

      this.isCapturing = false;
      console.log("Tab capture stopped");
    }
  }

  private async getMeetingTabs(): Promise<TabInfo[]> {
    const tabs = await chrome.tabs.query({
      url: [
        "https://meet.google.com/*",
        "https://zoom.us/*",
        "https://*.zoom.us/*",
        "https://teams.microsoft.com/*",
        "https://*.teams.microsoft.com/*",
      ],
    });

    return tabs.map((tab) => ({
      id: tab.id!,
      url: tab.url!,
      title: tab.title || "Unknown",
    }));
  }

  private checkMeetingTab(tab: chrome.tabs.Tab) {
    const meetingUrls = ["meet.google.com", "zoom.us", "teams.microsoft.com"];

    if (tab.url && meetingUrls.some((url) => tab.url!.includes(url))) {
      this.activeTab = {
        id: tab.id!,
        url: tab.url,
        title: tab.title || "Unknown",
      };

      // Notify popup about active meeting tab
      this.broadcastToTabs({
        type: "meetingTabDetected",
        data: this.activeTab,
      });
    }
  }

  private async broadcastToTabs(message: ExtensionMessage) {
    const tabs = await chrome.tabs.query({});

    for (const tab of tabs) {
      if (tab.id) {
        try {
          chrome.tabs.sendMessage(tab.id, message);
        } catch (error) {
          // Tab might not have content script injected
        }
      }
    }
  }
}

// Initialize background service
new BackgroundService();

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("TranslatorJHU extension installed");

    // Open welcome page or settings
    chrome.tabs.create({
      url: chrome.runtime.getURL("popup.html"),
    });
  }
});
