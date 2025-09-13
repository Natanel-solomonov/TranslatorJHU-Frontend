import React, { useState, useEffect } from "react";
import {
  Play,
  Square,
  Mic,
  MicOff,
  Settings,
  Languages,
  Volume2,
  Wifi,
  WifiOff,
  Monitor,
  AlertCircle,
} from "lucide-react";
import { useTranslationStore } from "../store/translationStore";
import toast, { Toaster } from "react-hot-toast";

interface TabInfo {
  id: number;
  url: string;
  title: string;
}

const PopupApp: React.FC = () => {
  const [activeTabs, setActiveTabs] = useState<TabInfo[]>([]);
  const [selectedTab, setSelectedTab] = useState<TabInfo | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [targetLanguage, setTargetLanguage] = useState("es");

  useEffect(() => {
    loadActiveTabs();
    checkConnectionStatus();

    // Listen for background messages
    chrome.runtime.onMessage.addListener((message) => {
      switch (message.type) {
        case "websocket:connected":
          setIsConnected(true);
          break;
        case "websocket:disconnected":
          setIsConnected(false);
          break;
        case "meetingTabDetected":
          loadActiveTabs();
          break;
      }
    });
  }, []);

  const loadActiveTabs = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "getActiveTabs",
      });
      setActiveTabs(response.tabs || []);

      if (response.tabs?.length > 0 && !selectedTab) {
        setSelectedTab(response.tabs[0]);
      }
    } catch (error) {
      console.error("Failed to load active tabs:", error);
    }
  };

  const checkConnectionStatus = async () => {
    // Check if content script is responding on active tab
    if (selectedTab) {
      try {
        const response = await chrome.tabs.sendMessage(selectedTab.id, {
          type: "ping",
        });
        setIsConnected(!!response?.pong);
      } catch (error) {
        setIsConnected(false);
      }
    }
  };

  const handleStartSession = async () => {
    if (!selectedTab) {
      toast.error("Please select a meeting tab");
      return;
    }

    if (!isConnected) {
      toast.error("Not connected to backend server");
      return;
    }

    try {
      // Start session via WebSocket
      await chrome.runtime.sendMessage({
        type: "websocket:send",
        data: {
          type: "session:start",
          payload: {
            sessionId: `session_${Date.now()}`,
            sourceLanguage,
            targetLanguage,
            tabId: selectedTab.id,
          },
        },
      });

      // Start audio capture on content script
      await chrome.tabs.sendMessage(selectedTab.id, {
        type: "startAudioCapture",
      });

      setIsRecording(true);
      toast.success("Translation session started");
    } catch (error) {
      console.error("Failed to start session:", error);
      toast.error("Failed to start session");
    }
  };

  const handleStopSession = async () => {
    if (!selectedTab) return;

    try {
      // Stop audio capture
      await chrome.tabs.sendMessage(selectedTab.id, {
        type: "stopAudioCapture",
      });

      // Stop session via WebSocket
      await chrome.runtime.sendMessage({
        type: "websocket:send",
        data: {
          type: "session:stop",
          payload: { tabId: selectedTab.id },
        },
      });

      setIsRecording(false);
      toast.success("Translation session stopped");
    } catch (error) {
      console.error("Failed to stop session:", error);
      toast.error("Failed to stop session");
    }
  };

  const handleShowCaptions = async () => {
    if (!selectedTab) return;

    try {
      await chrome.tabs.sendMessage(selectedTab.id, {
        type: "showCaptions",
        data: { sourceLanguage, targetLanguage },
      });
      toast.success("Captions overlay enabled");
    } catch (error) {
      console.error("Failed to show captions:", error);
      toast.error("Failed to enable captions");
    }
  };

  const handleHideCaptions = async () => {
    if (!selectedTab) return;

    try {
      await chrome.tabs.sendMessage(selectedTab.id, {
        type: "hideCaptions",
      });
      toast.success("Captions overlay disabled");
    } catch (error) {
      console.error("Failed to hide captions:", error);
    }
  };

  const getTabPlatform = (url: string): string => {
    if (url.includes("meet.google.com")) return "Google Meet";
    if (url.includes("zoom.us")) return "Zoom";
    if (url.includes("teams.microsoft.com")) return "Microsoft Teams";
    return "Unknown Platform";
  };

  const languages = [
    { code: "en", name: "English" },
    { code: "es", name: "Spanish" },
    { code: "fr", name: "French" },
    { code: "de", name: "German" },
    { code: "it", name: "Italian" },
    { code: "pt", name: "Portuguese" },
    { code: "zh", name: "Chinese" },
    { code: "ja", name: "Japanese" },
    { code: "ko", name: "Korean" },
    { code: "ar", name: "Arabic" },
  ];

  return (
    <div className="w-full h-full bg-white flex flex-col">
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            fontSize: "14px",
            maxWidth: "300px",
          },
        }}
      />

      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">TranslatorJHU</h1>
          <div className="flex items-center space-x-2">
            {isConnected ? (
              <Wifi className="w-4 h-4 text-green-500" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
            {isRecording && (
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Real-time translation for video meetings
        </p>
      </div>

      {/* Connection Status */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center space-x-2 text-sm">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`}
          ></div>
          <span className="text-gray-600">
            {isConnected ? "Connected to backend" : "Backend disconnected"}
          </span>
        </div>
      </div>

      {/* Meeting Tab Selection */}
      <div className="p-4 border-b border-gray-200">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Active Meeting Tabs
        </label>

        {activeTabs.length === 0 ? (
          <div className="flex items-center space-x-2 text-sm text-gray-500 p-3 bg-gray-50 rounded-lg">
            <AlertCircle className="w-4 h-4" />
            <span>No meeting tabs detected</span>
          </div>
        ) : (
          <div className="space-y-2">
            {activeTabs.map((tab) => (
              <div
                key={tab.id}
                className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedTab?.id === tab.id
                    ? "border-primary-500 bg-primary-50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
                onClick={() => setSelectedTab(tab)}
              >
                <Monitor className="w-4 h-4 text-gray-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {getTabPlatform(tab.url)}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{tab.title}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Language Selection */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2 mb-3">
          <Languages className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Languages</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">From</label>
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">To</label>
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="p-4 space-y-3">
        {!isRecording ? (
          <button
            onClick={handleStartSession}
            disabled={!selectedTab || !isConnected}
            className="w-full flex items-center justify-center space-x-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            <Play className="w-4 h-4" />
            <span>Start Translation</span>
          </button>
        ) : (
          <button
            onClick={handleStopSession}
            className="w-full flex items-center justify-center space-x-2 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            <Square className="w-4 h-4" />
            <span>Stop Translation</span>
          </button>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleShowCaptions}
            disabled={!selectedTab}
            className="flex items-center justify-center space-x-1 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
          >
            <Volume2 className="w-4 h-4" />
            <span>Show Captions</span>
          </button>

          <button
            onClick={handleHideCaptions}
            disabled={!selectedTab}
            className="flex items-center justify-center space-x-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
          >
            <MicOff className="w-4 h-4" />
            <span>Hide Captions</span>
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto p-4 border-t border-gray-200">
        <div className="text-xs text-gray-500 text-center">
          Natural voice synthesis with ElevenLabs
        </div>
      </div>
    </div>
  );
};

export default PopupApp;
