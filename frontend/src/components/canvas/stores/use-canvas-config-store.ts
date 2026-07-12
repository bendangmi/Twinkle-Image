"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { getDefaultModelId } from "@/lib/gemini-config";
import type { CanvasGenerationConfig } from "../canvas-generation-service";

export const defaultCanvasConfig: CanvasGenerationConfig = {
  model: getDefaultModelId(),
  outputSize: "1K",
  aspectRatio: "1:1",
  customSize: undefined,
  temperature: 1,
  count: 1,
  gptImageQuality: "auto",
  gptImageStyle: "auto",
  gptImageBackground: "auto",
};

type CanvasConfigStore = {
  config: CanvasGenerationConfig;
  updateConfig: <K extends keyof CanvasGenerationConfig>(key: K, value: CanvasGenerationConfig[K]) => void;
  setConfig: (patch: Partial<CanvasGenerationConfig>) => void;
};

export const useCanvasConfigStore = create<CanvasConfigStore>()(
  persist(
    (set) => ({
      config: defaultCanvasConfig,
      updateConfig: (key, value) => set((state) => ({ config: { ...state.config, [key]: value } })),
      setConfig: (patch) => set((state) => ({ config: { ...state.config, ...patch } })),
    }),
    {
      name: "nova-image:canvas_config",
      storage: createJSONStorage(() => (typeof window !== "undefined" ? window.localStorage : (undefined as unknown as Storage))),
      merge: (persisted, current) => {
        const persistedConfig = ((persisted as Partial<CanvasConfigStore>)?.config || {}) as Partial<CanvasGenerationConfig>;
        return { ...current, config: { ...defaultCanvasConfig, ...persistedConfig } };
      },
    },
  ),
);
