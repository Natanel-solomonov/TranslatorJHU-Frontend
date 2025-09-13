import { create } from "zustand";

export interface TranslationSession {
  id: string;
  sourceLanguage: string;
  targetLanguage: string;
  isActive: boolean;
  startTime: Date;
  tabId?: number;
}

export interface Caption {
  id: string;
  originalText: string;
  translatedText: string;
  timestamp: Date;
  confidence: number;
  isProcessing: boolean;
}

interface TranslationState {
  // Session state
  currentSession: TranslationSession | null;
  isRecording: boolean;

  // Translation state
  captions: Caption[];
  sourceLanguage: string;
  targetLanguage: string;

  // Actions
  startSession: (
    sourceLanguage: string,
    targetLanguage: string,
    tabId?: number
  ) => void;
  stopSession: () => void;
  startRecording: () => void;
  stopRecording: () => void;
  addCaption: (caption: Omit<Caption, "id" | "timestamp">) => void;
  updateCaption: (id: string, updates: Partial<Caption>) => void;
  setLanguages: (source: string, target: string) => void;
  clearCaptions: () => void;
}

export const useTranslationStore = create<TranslationState>((set, _get) => ({
  // Initial state
  currentSession: null,
  isRecording: false,
  captions: [],
  sourceLanguage: "en",
  targetLanguage: "es",

  // Actions
  startSession: (
    sourceLanguage: string,
    targetLanguage: string,
    tabId?: number
  ) => {
    const session: TranslationSession = {
      id: `session_${Date.now()}`,
      sourceLanguage,
      targetLanguage,
      isActive: true,
      startTime: new Date(),
      tabId,
    };

    set({
      currentSession: session,
      sourceLanguage,
      targetLanguage,
    });
  },

  stopSession: () => {
    set({
      currentSession: null,
      isRecording: false,
    });
  },

  startRecording: () => {
    set({ isRecording: true });
  },

  stopRecording: () => {
    set({ isRecording: false });
  },

  addCaption: (caption) => {
    const newCaption: Caption = {
      ...caption,
      id: `caption_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };

    set((state) => ({
      captions: [...state.captions, newCaption].slice(-10), // Keep only last 10 captions
    }));
  },

  updateCaption: (id, updates) => {
    set((state) => ({
      captions: state.captions.map((caption) =>
        caption.id === id ? { ...caption, ...updates } : caption
      ),
    }));
  },

  setLanguages: (source, target) => {
    set({ sourceLanguage: source, targetLanguage: target });
  },

  clearCaptions: () => {
    set({ captions: [] });
  },
}));
