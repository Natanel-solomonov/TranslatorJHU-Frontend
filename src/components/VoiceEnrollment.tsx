import React, { useState, useEffect, useRef } from 'react';
import { authService, VoiceEnrollment as VoiceEnrollmentType } from '../services/authService';

interface VoiceEnrollmentProps {
  onEnrollmentComplete: () => void;
  onSkip: () => void;
}

export const VoiceEnrollment: React.FC<VoiceEnrollmentProps> = ({ 
  onEnrollmentComplete, 
  onSkip 
}) => {
  const [phrases] = useState(authService.getRandomEnrollmentPhrases(3));
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
  const [recordings, setRecordings] = useState<VoiceEnrollmentType[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState('');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    // Initialize recordings array
    const initialRecordings: VoiceEnrollmentType[] = phrases.map((phrase, index) => ({
      phraseId: `phrase_${index}`,
      phrase,
      audioData: new ArrayBuffer(0),
      recorded: false
    }));
    setRecordings(initialRecordings);
  }, [phrases]);

  const startRecording = async () => {
    try {
      setIsProcessing(true);
      setMessage('Requesting microphone access...');
      console.log("Requesting microphone access...");
      
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser');
      }
      
      // Request microphone access with the same constraints as the main translation feature
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000, // Optimal for speech recognition
          channelCount: 1,
        },
      });

      console.log("Microphone access granted");

      // Use the same MIME type selection as the main translation feature
      const getSupportedMimeType = (): string => {
        const mimeTypes = [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/ogg;codecs=opus",
          "audio/mp4",
          "audio/wav",
        ];

        for (const mimeType of mimeTypes) {
          if (MediaRecorder.isTypeSupported(mimeType)) {
            return mimeType;
          }
        }

        return "audio/webm"; // fallback
      };

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: getSupportedMimeType(),
        audioBitsPerSecond: 16000,
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log("Audio data available:", event.data.size, "bytes");
          audioChunksRef.current.push(event.data);
        } else {
          console.log("No audio data. Size:", event.data.size);
        }
      };

      mediaRecorder.onerror = (error) => {
        console.error("MediaRecorder error:", error);
        setMessage('Recording error occurred. Please try again.');
        setIsRecording(false);
        setIsProcessing(false);
      };

      mediaRecorder.onstart = () => {
        console.log("MediaRecorder started");
      };

      mediaRecorder.onstop = () => {
        console.log("MediaRecorder stopped");
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioBlob.arrayBuffer().then((arrayBuffer) => {
          const newRecordings = [...recordings];
          newRecordings[currentPhraseIndex] = {
            ...newRecordings[currentPhraseIndex],
            audioData: arrayBuffer,
            recorded: true
          };
          setRecordings(newRecordings);
        });

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        setIsProcessing(false);
      };

      mediaRecorderRef.current = mediaRecorder;
      // Start recording with small time slices for real-time streaming (same as main translation)
      mediaRecorder.start(100); // 100ms chunks
      setIsRecording(true);
      setIsProcessing(false);
      setMessage('🎤 Recording... Speak clearly into your microphone.');
      console.log("Audio recording started successfully");
    } catch (error: any) {
      console.error("Failed to initialize audio capture:", error);
      let errorMessage = 'Failed to access microphone. ';
      
      if (error.name === 'NotAllowedError') {
        errorMessage += 'Microphone access denied. Please allow microphone access and try again.';
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'No microphone found. Please connect a microphone and try again.';
      } else if (error.name === 'NotReadableError') {
        errorMessage += 'Microphone is being used by another application. Please close other apps using the microphone.';
      } else if (error.name === 'NotSupportedError') {
        errorMessage += 'Microphone access is not supported in this context. Please try refreshing the extension.';
      } else if (error.message?.includes('getUserMedia is not supported')) {
        errorMessage += 'Your browser does not support microphone access. Please use a modern browser like Chrome, Firefox, or Edge.';
      } else {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errorMessage += `Audio initialization failed: ${errorMsg}`;
      }
      
      setMessage(errorMessage);
      setIsProcessing(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setMessage('Recording saved! You can record again or move to the next phrase.');
      console.log("Audio recording stopped");
    }
  };

  const nextPhrase = () => {
    if (currentPhraseIndex < phrases.length - 1) {
      setCurrentPhraseIndex(currentPhraseIndex + 1);
      setMessage('');
    }
  };

  const prevPhrase = () => {
    if (currentPhraseIndex > 0) {
      setCurrentPhraseIndex(currentPhraseIndex - 1);
      setMessage('');
    }
  };

  const completeEnrollment = async () => {
    setIsProcessing(true);
    setMessage('Processing voice enrollment...');

    try {
      const result = await authService.completeVoiceEnrollment(recordings);
      
      if (result.success) {
        setMessage('Voice enrollment completed successfully!');
        setTimeout(() => {
          onEnrollmentComplete();
        }, 1500);
      } else {
        setMessage(result.message);
      }
    } catch (error) {
      setMessage('Voice enrollment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const allRecorded = recordings.every(recording => recording.recorded);
  const currentRecording = recordings[currentPhraseIndex];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Voice Enrollment
          </h2>
          <p className="text-gray-600 mb-4">
            Please record yourself saying these phrases to complete your setup
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            <div className="flex items-center justify-center">
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span><strong>Tip:</strong> When prompted, allow microphone access for the best experience</span>
            </div>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Phrase {currentPhraseIndex + 1} of {phrases.length}</span>
            <span>{recordings.filter(r => r.recorded).length} recorded</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentPhraseIndex + 1) / phrases.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Current phrase */}
        <div className="bg-gray-50 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Say this phrase:
          </h3>
          <p className="text-xl text-gray-700 leading-relaxed">
            "{phrases[currentPhraseIndex]}"
          </p>
          
          {currentRecording?.recorded && (
            <div className="mt-4 flex items-center text-green-600">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">Recorded ✓</span>
            </div>
          )}
        </div>

        {/* Recording controls */}
        <div className="flex justify-center mb-8">
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={isProcessing}
              className="bg-gradient-to-r from-red-500 to-red-600 text-white px-8 py-4 rounded-2xl hover:from-red-600 hover:to-red-700 focus:outline-none focus:ring-4 focus:ring-red-300 focus:ring-offset-2 flex items-center space-x-3 font-semibold text-lg shadow-xl transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
              </svg>
              <span>{isProcessing ? 'Requesting Access...' : '🎤 Start Recording'}</span>
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="bg-gradient-to-r from-gray-600 to-gray-700 text-white px-8 py-4 rounded-2xl hover:from-gray-700 hover:to-gray-800 focus:outline-none focus:ring-4 focus:ring-gray-300 focus:ring-offset-2 flex items-center space-x-3 font-semibold text-lg shadow-xl transform hover:scale-105 transition-all duration-200"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1zm4 0a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>⏹️ Stop Recording</span>
            </button>
          )}
        </div>

        {/* Navigation */}
        <div className="flex flex-col space-y-4">
          {/* Phrase navigation */}
          <div className="flex justify-center space-x-3">
            <button
              onClick={prevPhrase}
              disabled={currentPhraseIndex === 0}
              className="px-6 py-3 text-gray-600 bg-gray-100 border border-gray-300 rounded-xl hover:bg-gray-200 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium shadow-sm"
            >
              ← Previous
            </button>
            <button
              onClick={nextPhrase}
              disabled={currentPhraseIndex === phrases.length - 1}
              className="px-6 py-3 text-gray-600 bg-gray-100 border border-gray-300 rounded-xl hover:bg-gray-200 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium shadow-sm"
            >
              Next →
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex justify-center space-x-4">
            <button
              onClick={onSkip}
              className="px-8 py-3 text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-semibold shadow-sm"
            >
              Skip for now
            </button>
            <button
              onClick={completeEnrollment}
              disabled={!allRecorded || isProcessing}
              className="px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold shadow-lg transform hover:scale-105 disabled:transform-none"
            >
              {isProcessing ? '⏳ Processing...' : '✅ Complete Enrollment'}
            </button>
          </div>
        </div>

        {message && (
          <div className={`mt-6 p-4 rounded-lg text-sm font-medium border-l-4 ${
            message.includes('success') || message.includes('completed') || message.includes('✓')
              ? 'bg-green-50 text-green-800 border-green-400'
              : message.includes('Recording') || message.includes('🎤')
              ? 'bg-blue-50 text-blue-800 border-blue-400'
              : 'bg-red-50 text-red-800 border-red-400'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {message.includes('success') || message.includes('completed') || message.includes('✓') ? (
                  <svg className="w-5 h-5 mr-2 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : message.includes('Recording') || message.includes('🎤') ? (
                  <svg className="w-5 h-5 mr-2 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 mr-2 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                )}
                <span>{message}</span>
              </div>
              {message.includes('Failed to access microphone') && (
                <button
                  onClick={() => {
                    setMessage('');
                    startRecording();
                  }}
                  className="ml-4 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded-md text-xs font-medium transition-colors"
                >
                  Try Again
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
