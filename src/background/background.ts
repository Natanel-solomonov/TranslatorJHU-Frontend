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
  private captionsShown = false;

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
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      if (changeInfo.status === "complete" && tab.url) {
        this.checkMeetingTab(tab);
      }
    });

    // Initialize WebSocket connection
    this.initializeWebSocket();
  }

  private async initializeWebSocket() {
    this.wsService = new WebSocketService("ws://localhost:3001/ws");

    this.wsService.onConnect(() => {
      console.log("Background: WebSocket connected");
      this.broadcastToTabs({ type: "websocket:connected" });
    });

    this.wsService.onDisconnect(() => {
      console.log("Background: WebSocket disconnected");
      this.broadcastToTabs({ type: "websocket:disconnected" });
    });

    this.wsService.onTranscription((data) => {
      console.log("Background: Received transcription:", data);
      this.broadcastToTabs({ type: "transcription", data });

      // Auto-show captions on first transcription
      if (!this.captionsShown) {
        this.captionsShown = true;
        this.broadcastToTabs({
          type: "showCaptions",
          data: { autoShow: true },
        });
      }
    });

    this.wsService.onTranslation((data) => {
      console.log("Background: Received translation:", data);
      this.broadcastToTabs({ type: "translation", data });
    });

    this.wsService.connect();
  }

  private async handleMessage(
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
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

      case "injectContentScript":
        await this.injectContentScript(message.data.tabId);
        sendResponse({ success: true });
        break;

      case "sendAudioData":
        if (this.wsService && message.data) {
          // Convert array back to ArrayBuffer
          const uint8Array = new Uint8Array(message.data);
          const arrayBuffer = uint8Array.buffer;
          console.log(
            "Background: Received audio data from content script:",
            arrayBuffer.byteLength,
            "bytes"
          );
          this.wsService.sendAudioData(arrayBuffer);
        } else {
          console.warn(
            "Background: Cannot send audio data. WebSocket service:",
            !!this.wsService,
            "Data:",
            !!message.data
          );
        }
        break;

      case "websocket:send":
        if (this.wsService) {
          this.wsService.send(message.data.type, message.data.payload);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: "WebSocket not connected" });
        }
        break;

      default:
        console.log("Unknown message type:", message.type);
    }
  }

  private async startTabCapture(tabId: number) {
    try {
      // Request tab capture permission
      chrome.tabCapture.capture(
        {
          audio: true,
          video: false,
        },
        (stream) => {
          if (stream) {
            this.isCapturing = true;

            // Send capture start message to content script
            chrome.tabs.sendMessage(tabId, {
              type: "captureStarted",
              data: { streamId: stream.id },
            });

            console.log("Tab capture started for tab:", tabId);
          }
        }
      );
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

    // Also check for any active tab that might be a meeting platform
    const activeTabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const allTabs = [
      ...tabs,
      ...activeTabs.filter(
        (tab) =>
          tab.url &&
          (tab.url.includes("meet.google.com") ||
            tab.url.includes("zoom.us") ||
            tab.url.includes("teams.microsoft.com"))
      ),
    ];

    // Remove duplicates
    const uniqueTabs = allTabs.filter(
      (tab, index, self) => index === self.findIndex((t) => t.id === tab.id)
    );

    return uniqueTabs.map((tab) => ({
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

  private async injectContentScript(tabId: number) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      console.log(`Content script injected into tab ${tabId}`);
    } catch (error) {
      console.error(
        `Failed to inject content script into tab ${tabId}:`,
        error
      );
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
