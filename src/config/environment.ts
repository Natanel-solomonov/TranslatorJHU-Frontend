// Frontend Environment Configuration
// This file manages environment-specific settings

interface EnvironmentConfig {
  backendUrl: string;
  websocketUrl: string;
  isDevelopment: boolean;
}

const getEnvironmentConfig = (): EnvironmentConfig => {
  // Check if we're in development mode
  const isDevelopment = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  
  // Default URLs - can be overridden by environment variables in production
  const defaultBackendUrl = 'http://localhost:8080';
  const defaultWebsocketUrl = 'ws://localhost:8080';
  
  // Get environment variables (Vite will replace these at build time)
  const backendUrl = (import.meta as any).env?.VITE_BACKEND_URL || defaultBackendUrl;
  const websocketUrl = (import.meta as any).env?.VITE_WEBSOCKET_URL || defaultWebsocketUrl;
  
  return {
    backendUrl,
    websocketUrl,
    isDevelopment
  };
};

export const environment = getEnvironmentConfig();

// Export individual values for convenience
export const { backendUrl, websocketUrl, isDevelopment } = environment;

// API endpoints
export const API_ENDPOINTS = {
  CAPTION_TEXT: `${backendUrl}/api/caption-text`,
  HEALTH: `${backendUrl}/api/health`,
  TRANSLATE: `${backendUrl}/api/translate`,
} as const;

// WebSocket endpoints
export const WS_ENDPOINTS = {
  MAIN: websocketUrl,
} as const;
