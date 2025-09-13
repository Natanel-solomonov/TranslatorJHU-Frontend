// Web Audio API service for browser extension
export class AudioCaptureService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private tabStream: MediaStream | null = null;
  private isRecording = false;

  // Voice Activity Detection
  private vadEnabled = true;
  private silenceThreshold = 0.01;
  private silenceTimeout = 1000; // ms
  private silenceTimer: number | null = null;

  // Audio data callback
  public onAudioData: ((audioData: ArrayBuffer) => void) | null = null;

  constructor() {}

  async initialize(): Promise<void> {
    try {
      // Request microphone access
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000, // Optimal for speech recognition
          channelCount: 1,
        },
      });

      // Create audio context for analysis
      this.audioContext = new AudioContext({ sampleRate: 16000 });

      console.log("Audio capture initialized");
    } catch (error) {
      console.error("Failed to initialize audio capture:", error);
      throw error;
    }
  }

  async startRecording(): Promise<void> {
    if (!this.micStream || this.isRecording) {
      return;
    }

    try {
      // Combine microphone and tab audio if available
      const audioTracks: MediaStreamTrack[] = [];

      // Add microphone tracks
      this.micStream.getAudioTracks().forEach((track) => {
        audioTracks.push(track);
      });

      // Create combined stream
      const combinedStream = new MediaStream(audioTracks);

      // Create MediaRecorder for audio streaming
      this.mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: this.getSupportedMimeType(),
        audioBitsPerSecond: 16000,
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && this.onAudioData) {
          // Convert blob to array buffer and call callback
          event.data.arrayBuffer().then((buffer) => {
            this.onAudioData?.(buffer);
          });
        }
      };

      this.mediaRecorder.onerror = (error) => {
        console.error("MediaRecorder error:", error);
      };

      // Start recording with small time slices for real-time streaming
      this.mediaRecorder.start(100); // 100ms chunks
      this.isRecording = true;

      // Start voice activity detection
      if (this.vadEnabled) {
        this.startVoiceActivityDetection();
      }

      console.log("Audio recording started");
    } catch (error) {
      console.error("Failed to start recording:", error);
      throw error;
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;

      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }

      console.log("Audio recording stopped");
    }
  }

  // For extension: capture tab audio
  async captureTabAudio(tabId: number): Promise<void> {
    try {
      // Request tab capture (this needs to be called from background script)
      const response = await chrome.runtime.sendMessage({
        type: "startCapture",
        data: { tabId },
      });

      if (response.success) {
        console.log("Tab audio capture requested");
      }
    } catch (error) {
      console.error("Failed to capture tab audio:", error);
    }
  }

  // Set tab stream from background script
  setTabStream(stream: MediaStream): void {
    this.tabStream = stream;
    console.log("Tab stream set for audio mixing");
  }

  private getSupportedMimeType(): string {
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
  }

  private startVoiceActivityDetection(): void {
    if (!this.audioContext || !this.micStream) {
      return;
    }

    const source = this.audioContext.createMediaStreamSource(this.micStream);
    const analyser = this.audioContext.createAnalyser();

    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const checkAudioLevel = () => {
      if (!this.isRecording) {
        return;
      }

      analyser.getByteFrequencyData(dataArray);

      // Calculate RMS (Root Mean Square) for audio level
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length) / 255;

      if (rms > this.silenceThreshold) {
        // Voice detected - clear silence timer
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
      } else {
        // Silence detected - start timer if not already started
        if (!this.silenceTimer) {
          this.silenceTimer = window.setTimeout(() => {
            // Send silence marker via callback
            chrome.runtime.sendMessage({
              type: "websocket:send",
              data: {
                type: "audio:silence",
                payload: { timestamp: Date.now() },
              },
            });
          }, this.silenceTimeout);
        }
      }

      requestAnimationFrame(checkAudioLevel);
    };

    checkAudioLevel();
  }

  async getAudioDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === "audioinput");
    } catch (error) {
      console.error("Failed to get audio devices:", error);
      return [];
    }
  }

  async switchInputDevice(deviceId: string): Promise<void> {
    if (this.isRecording) {
      this.stopRecording();
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
    }

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      });

      console.log("Switched to audio device:", deviceId);
    } catch (error) {
      console.error("Failed to switch audio device:", error);
      throw error;
    }
  }

  setVoiceActivityDetection(enabled: boolean): void {
    this.vadEnabled = enabled;
  }

  setSilenceThreshold(threshold: number): void {
    this.silenceThreshold = Math.max(0, Math.min(1, threshold));
  }

  dispose(): void {
    this.stopRecording();

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    if (this.tabStream) {
      this.tabStream.getTracks().forEach((track) => track.stop());
      this.tabStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  get recording(): boolean {
    return this.isRecording;
  }
}
