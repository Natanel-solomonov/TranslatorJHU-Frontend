import React, { useState, useEffect } from "react";
import { Volume2, VolumeX } from "lucide-react";

interface Caption {
  id: string;
  originalText: string;
  translatedText: string;
  timestamp: Date;
  confidence: number;
  isProcessing: boolean;
}

const CaptionsOverlay: React.FC = () => {
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [isVisible, setIsVisible] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(
    null
  );

  useEffect(() => {
    // Listen for messages from content script
    const handleMessage = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin &&
        !event.origin.includes("chrome-extension://")
      ) {
        return;
      }

      const { type, data } = event.data;

      switch (type) {
        case "showCaptions":
          setIsVisible(true);
          break;

        case "hideCaptions":
          setIsVisible(false);
          break;

        case "transcription":
          handleTranscription(data);
          break;

        case "translation":
          handleTranslation(data);
          break;

        case "audioStream":
          if (audioEnabled) {
            playAudioStream(data.audioData);
          }
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [audioEnabled]);

  const handleTranscription = (data: any) => {
    if (data.isFinal) {
      // Update existing caption
      setCaptions((prev) =>
        prev.map((caption) =>
          caption.id === data.id
            ? {
                ...caption,
                originalText: data.text,
                confidence: data.confidence,
                isProcessing: false,
              }
            : caption
        )
      );
    } else {
      // Add new processing caption
      const newCaption: Caption = {
        id: data.id,
        originalText: data.text,
        translatedText: "",
        timestamp: new Date(),
        confidence: data.confidence,
        isProcessing: true,
      };

      setCaptions((prev) => {
        // Remove old captions if we have more than 3
        const filtered = prev.filter((cap) => cap.id !== data.id);
        const updated = [...filtered, newCaption];
        return updated.slice(-3); // Keep only last 3 captions
      });
    }
  };

  const handleTranslation = (data: any) => {
    setCaptions((prev) =>
      prev.map((caption) =>
        caption.id === data.captionId
          ? {
              ...caption,
              translatedText: data.translatedText,
              isProcessing: false,
            }
          : caption
      )
    );

    // Play translated audio if available
    if (audioEnabled && data.audioData) {
      playAudioStream(data.audioData);
    }
  };

  const playAudioStream = (audioData: ArrayBuffer) => {
    try {
      // Stop current audio
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }

      // Create audio blob and play
      const blob = new Blob([audioData], { type: "audio/mp3" });
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setCurrentAudio(null);
      };

      audio.onerror = (error) => {
        console.error("Audio playback error:", error);
        URL.revokeObjectURL(audioUrl);
        setCurrentAudio(null);
      };

      setCurrentAudio(audio);
      audio.play();
    } catch (error) {
      console.error("Failed to play audio:", error);
    }
  };

  const toggleAudio = () => {
    if (currentAudio && !audioEnabled) {
      currentAudio.pause();
      setCurrentAudio(null);
    }
    setAudioEnabled(!audioEnabled);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="captions-overlay">
      <div className="captions-container">
        {/* Controls */}
        <div className="captions-controls">
          <button
            onClick={toggleAudio}
            className="audio-toggle"
            title={audioEnabled ? "Disable audio" : "Enable audio"}
          >
            {audioEnabled ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Captions */}
        <div className="captions-list">
          {captions.length === 0 ? (
            <div className="caption-placeholder">Listening for speech...</div>
          ) : (
            captions.map((caption, index) => (
              <div
                key={caption.id}
                className={`caption-item ${
                  caption.isProcessing ? "processing" : ""
                } ${index === captions.length - 1 ? "latest" : ""}`}
              >
                {/* Original text */}
                <div className="caption-original">
                  {caption.originalText}
                  {caption.isProcessing && (
                    <span className="processing-indicator">...</span>
                  )}
                </div>

                {/* Translated text */}
                {caption.translatedText && (
                  <div className="caption-translated">
                    {caption.translatedText}
                  </div>
                )}

                {/* Confidence indicator */}
                <div className="caption-meta">
                  <div
                    className="confidence-bar"
                    style={{ width: `${caption.confidence * 100}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default CaptionsOverlay;
