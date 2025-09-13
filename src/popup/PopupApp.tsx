import React, { useState, useEffect } from "react";
import {
  Play,
  Square,
  // Mic,
  MicOff,
  // Settings,
  Languages,
  Volume2,
  Wifi,
  WifiOff,
  Monitor,
  AlertCircle,
  User,
  LogOut,
} from "lucide-react";
// import { useTranslationStore } from "../store/translationStore";
import toast, { Toaster } from "react-hot-toast";
import { AuthModal } from "../components/AuthModal";
import { VoiceEnrollment } from "../components/VoiceEnrollment";
import { authService, User as AuthUser } from "../services/authService";

interface TabInfo {
  id: number;
  url: string;
  title: string;
}

const PopupApp: React.FC = () => {
  const [activeTabs, setActiveTabs] = useState<TabInfo[]>([]);
  const [selectedTab, setSelectedTab] = useState<TabInfo | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [targetLanguage, setTargetLanguage] = useState("es");
  const [isConnecting, setIsConnecting] = useState(false);
  
  // Authentication state
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showVoiceEnrollment, setShowVoiceEnrollment] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    initializePopup();

    // Set up periodic connection check
    const connectionInterval = setInterval(() => {
      checkConnectionStatus();
    }, 2000);

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
        case "translation:started":
          setIsMonitoring(true);
          saveTranslationState(true);
          break;
        case "translation:stopped":
          setIsMonitoring(false);
          saveTranslationState(false);
          break;
      }
    });

    return () => {
      clearInterval(connectionInterval);
    };
  }, [selectedTab]);

  const initializePopup = async () => {
    setIsLoading(true);
    
    // First check if translation is running
    const isTranslationRunning = await loadTranslationState();
    
    // If translation is running, skip authentication
    if (isTranslationRunning) {
      await loadActiveTabs();
      await checkConnectionStatus();
      setIsLoading(false);
      return;
    }
    
    // If not running, proceed with normal initialization
    await loadActiveTabs();
    await checkConnectionStatus();
    await checkAuthenticationStatus();
    setIsLoading(false);
  };

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

  const loadTranslationState = async () => {
    try {
      const result = await chrome.storage.local.get(['isTranslationRunning', 'translationTabId']);
      if (result.isTranslationRunning && result.translationTabId) {
        // Find the tab that was running translation
        const response = await chrome.runtime.sendMessage({
          type: "getActiveTabs",
        });
        const tabs = response.tabs || [];
        const translationTab = tabs.find((tab: TabInfo) => tab.id === result.translationTabId);
        if (translationTab) {
          setSelectedTab(translationTab);
          
          // Verify translation is actually running on that tab
          try {
            const verificationResponse = await chrome.tabs.sendMessage(translationTab.id, {
              type: "getTranslationStatus"
            });
            
            if (verificationResponse?.isRunning) {
              setIsMonitoring(true);
              return true; // Translation is running
            } else {
              // Translation not actually running, clear state
              await chrome.storage.local.remove(['isTranslationRunning', 'translationTabId']);
              setIsMonitoring(false);
              return false;
            }
          } catch (error) {
            // Tab not accessible, clear state
            await chrome.storage.local.remove(['isTranslationRunning', 'translationTabId']);
            setIsMonitoring(false);
            return false;
          }
        }
      }
      setIsMonitoring(false);
      return false;
    } catch (error) {
      console.error("Failed to load translation state:", error);
      setIsMonitoring(false);
      return false;
    }
  };

  const saveTranslationState = async (isRunning: boolean) => {
    try {
      await chrome.storage.local.set({
        isTranslationRunning: isRunning,
        translationTabId: isRunning ? selectedTab?.id : null
      });
    } catch (error) {
      console.error("Failed to save translation state:", error);
    }
  };

  const checkConnectionStatus = async () => {
    // Check if content script is responding on active tab
    if (selectedTab) {
      try {
        const response = await chrome.tabs.sendMessage(selectedTab.id, {
          type: "ping",
        });
        console.log("Ping response:", response);
        setIsConnected(!!response?.pong);
      } catch (error) {
        console.log("Ping failed:", error);
        // Try to inject content script if it's not loaded
        try {
          await chrome.runtime.sendMessage({
            type: "injectContentScript",
            data: { tabId: selectedTab.id }
          });
          console.log("Attempted to inject content script");
          // Wait a bit and try again
          setTimeout(() => {
            chrome.tabs.sendMessage(selectedTab.id, { type: "ping" })
              .then(response => {
                console.log("Ping after injection:", response);
                setIsConnected(!!response?.pong);
              })
              .catch(() => setIsConnected(false));
          }, 1000);
        } catch (injectError) {
          console.log("Failed to inject content script:", injectError);
          setIsConnected(false);
        }
      }
    } else {
      setIsConnected(false);
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
      const wsResponse = await chrome.runtime.sendMessage({
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

      if (!wsResponse?.success) {
        throw new Error(wsResponse?.error || "Failed to start WebSocket session");
      }

      // Start caption monitoring on content script
      const captionResponse = await chrome.tabs.sendMessage(selectedTab.id, {
        type: "startCaptionMonitoring",
        data: {
          targetLanguage: targetLanguage
        }
      });

      if (!captionResponse?.success) {
        throw new Error("Failed to start caption monitoring");
      }

      setIsMonitoring(true);
      saveTranslationState(true);
      toast.success("Caption translation started - monitoring Google Meet captions");
      
      // Send message to background script
      chrome.runtime.sendMessage({
        type: "translation:started",
        data: { tabId: selectedTab.id }
      });
      
    } catch (error) {
      console.error("Failed to start session:", error);
      toast.error(`Failed to start session: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleStopSession = async () => {
    if (!selectedTab) return;

    try {
      // Stop caption monitoring
      await chrome.tabs.sendMessage(selectedTab.id, {
        type: "stopCaptionMonitoring",
      });

      // Hide captions automatically when stopping
      await chrome.tabs.sendMessage(selectedTab.id, {
        type: "hideCaptions",
      });

      // Stop session via WebSocket
      await chrome.runtime.sendMessage({
        type: "websocket:send",
        data: {
          type: "session:stop",
          payload: { tabId: selectedTab.id },
        },
      });

      setIsMonitoring(false);
      saveTranslationState(false);
      toast.success("Caption translation stopped");
      
      // Send message to background script
      chrome.runtime.sendMessage({
        type: "translation:stopped",
        data: { tabId: selectedTab.id }
      });
    } catch (error) {
      console.error("Failed to stop session:", error);
      toast.error("Failed to stop session");
    }
  };

  const handleShowCaptions = async () => {
    if (!selectedTab) return;

    try {
      const response = await chrome.tabs.sendMessage(selectedTab.id, {
        type: "showCaptions",
        data: { sourceLanguage, targetLanguage },
      });
      
      if (response?.success) {
        toast.success("Captions overlay enabled");
      } else {
        throw new Error(response?.error || "Failed to show captions");
      }
    } catch (error) {
      console.error("Failed to show captions:", error);
      toast.error(`Failed to enable captions: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleHideCaptions = async () => {
    if (!selectedTab) return;

    try {
      const response = await chrome.tabs.sendMessage(selectedTab.id, {
        type: "hideCaptions",
      });
      
      if (response?.success) {
        toast.success("Captions overlay disabled");
      } else {
        throw new Error(response?.error || "Failed to hide captions");
      }
    } catch (error) {
      console.error("Failed to hide captions:", error);
      toast.error(`Failed to hide captions: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleManualConnect = async () => {
    if (!selectedTab) {
      toast.error("Please select a meeting tab first");
      return;
    }

    setIsConnecting(true);
    try {
      // Try to inject content script
      await chrome.runtime.sendMessage({
        type: "injectContentScript",
        data: { tabId: selectedTab.id }
      });
      
      // Wait a bit for injection to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Test connection
      await checkConnectionStatus();
      
      if (isConnected) {
        toast.success("Successfully connected!");
      } else {
        toast.error("Failed to connect. Please refresh the page and try again.");
      }
    } catch (error) {
      console.error("Manual connect failed:", error);
      toast.error(`Connection failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const getTabPlatform = (url: string): string => {
    if (url.includes("meet.google.com")) return "Google Meet";
    if (url.includes("zoom.us")) return "Zoom";
    if (url.includes("teams.microsoft.com")) return "Microsoft Teams";
    return "Unknown Platform";
  };

  // Authentication functions
  const checkAuthenticationStatus = () => {
    const user = authService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
      
      // Check if user needs voice enrollment
      if (!user.voiceEnrolled) {
        setShowVoiceEnrollment(true);
      }
    } else {
      setShowAuthModal(true);
    }
  };

  const handleAuthSuccess = (user: AuthUser) => {
    setCurrentUser(user);
    setShowAuthModal(false);
    
    // Check if user needs voice enrollment
    if (!user.voiceEnrolled) {
      setShowVoiceEnrollment(true);
    }
  };

  const handleVoiceEnrollmentComplete = () => {
    setShowVoiceEnrollment(false);
    toast.success("Voice enrollment completed!");
  };

  const handleSkipVoiceEnrollment = () => {
    setShowVoiceEnrollment(false);
    toast.success("Voice enrollment skipped. You can complete it later.");
  };

  const handleLogout = () => {
    authService.logout();
    setCurrentUser(null);
    setShowAuthModal(true);
    toast.success("Logged out successfully");
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

  // Show loading screen while initializing
  if (isLoading) {
    return (
      <div className="w-full h-full bg-white flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <p className="mt-2 text-sm text-gray-600">Loading...</p>
      </div>
    );
  }

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
            {currentUser && (
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1 text-sm text-gray-600">
                  <User className="w-4 h-4" />
                  <span>{currentUser.username}</span>
                  {currentUser.voiceEnrolled && (
                    <div className="w-2 h-2 bg-green-500 rounded-full" title="Voice enrolled"></div>
                  )}
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1 text-gray-400 hover:text-gray-600"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
            {isConnected ? (
              <Wifi className="w-4 h-4 text-green-500" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
            {isMonitoring && (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-red-600 font-medium">Monitoring</span>
              </div>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {isMonitoring ? "Translation is active - monitoring captions" : "Real-time translation for video meetings"}
        </p>
      </div>

      {/* Connection Status */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-green-500" : "bg-red-500"
              }`}
            ></div>
            <span className="text-gray-600">
              {isConnected ? "Connected to backend" : "Backend disconnected"}
            </span>
          </div>
          {!isConnected && selectedTab && (
            <button
              onClick={handleManualConnect}
              disabled={isConnecting}
              className="text-xs bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-2 py-1 rounded"
            >
              {isConnecting ? "Connecting..." : "Connect"}
            </button>
          )}
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
        {!isMonitoring ? (
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

      {/* Authentication Modals - Only show when translation is not running */}
      {!isMonitoring && showAuthModal && (
        <AuthModal onAuthSuccess={handleAuthSuccess} />
      )}

      {!isMonitoring && showVoiceEnrollment && (
        <VoiceEnrollment 
          onEnrollmentComplete={handleVoiceEnrollmentComplete}
          onSkip={handleSkipVoiceEnrollment}
        />
      )}
    </div>
  );
};

export default PopupApp;
