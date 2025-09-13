export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: number;
}

export interface TranscriptionData {
  id: string;
  text: string;
  confidence: number;
  isFinal: boolean;
}

export interface TranslationData {
  captionId: string;
  translatedText: string;
  confidence: number;
}

export class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;

  private onConnectCallbacks: (() => void)[] = [];
  private onDisconnectCallbacks: (() => void)[] = [];
  private onTranscriptionCallbacks: ((data: TranscriptionData) => void)[] = [];
  private onTranslationCallbacks: ((data: TranslationData) => void)[] = [];
  private onErrorCallbacks: ((error: Event) => void)[] = [];

  constructor(private url: string = "ws://localhost:8080") {}

  connect(): void {
    if (
      this.isConnecting ||
      (this.ws && this.ws.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    this.isConnecting = true;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log("WebSocket connected");
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.onConnectCallbacks.forEach((callback) => callback());
      };

      this.ws.onmessage = (event) => {
        try {
          console.log("WebSocket: Received message:", event.data);
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log("WebSocket: Parsed message:", message);
          this.handleMessage(message);
        } catch (error) {
          console.error("WebSocket: Failed to parse message:", error);
          console.error("WebSocket: Raw data:", event.data);
        }
      };

      this.ws.onclose = () => {
        console.log("WebSocket disconnected");
        this.isConnecting = false;
        this.onDisconnectCallbacks.forEach((callback) => callback());
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        this.isConnecting = false;
        this.onErrorCallbacks.forEach((callback) => callback(error));
      };
    } catch (error) {
      console.error("Failed to create WebSocket connection:", error);
      this.isConnecting = false;
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(type: string, data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message: WebSocketMessage = {
        type,
        data,
        timestamp: Date.now(),
      };
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn("WebSocket is not connected. Cannot send message:", type);
    }
  }

  sendAudioData(audioData: ArrayBuffer): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log("WebSocket: Sending audio data:", audioData.byteLength, "bytes");
      console.log("WebSocket: Audio data type:", typeof audioData, "Constructor:", audioData.constructor.name);
      // Send binary audio data
      this.ws.send(audioData);
      console.log("WebSocket: Audio data sent successfully");
    } else {
      console.warn("WebSocket: Cannot send audio data. WebSocket state:", this.ws?.readyState);
    }
  }

  private handleMessage(message: WebSocketMessage): void {
    console.log("WebSocket: Handling message type:", message.type);
    switch (message.type) {
      case "transcription":
        console.log("WebSocket: Processing transcription:", message.data);
        this.onTranscriptionCallbacks.forEach((callback) => {
          console.log("WebSocket: Calling transcription callback");
          callback(message.data as TranscriptionData);
        });
        break;

      case "translation":
        console.log("WebSocket: Processing translation:", message.data);
        this.onTranslationCallbacks.forEach((callback) => {
          console.log("WebSocket: Calling translation callback");
          callback(message.data as TranslationData);
        });
        break;

      case "error":
        console.error("Backend error:", message.data);
        break;

      default:
        console.log("WebSocket: Unknown message type:", message.type, message.data);
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
      );

      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error("Max reconnection attempts reached");
    }
  }

  // Event listeners
  onConnect(callback: () => void): void {
    this.onConnectCallbacks.push(callback);
  }

  onDisconnect(callback: () => void): void {
    this.onDisconnectCallbacks.push(callback);
  }

  onTranscription(callback: (data: TranscriptionData) => void): void {
    this.onTranscriptionCallbacks.push(callback);
  }

  onTranslation(callback: (data: TranslationData) => void): void {
    this.onTranslationCallbacks.push(callback);
  }

  onError(callback: (error: Event) => void): void {
    this.onErrorCallbacks.push(callback);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
