/// <reference types="vite/client" />

import type { TtApi } from '../main/preload';

declare global {
  interface Window {
    tt: TtApi;
  }
}

export {};
