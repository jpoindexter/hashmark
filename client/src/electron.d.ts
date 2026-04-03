interface Window {
  // Auth token injected by the server into the SPA HTML
  __STUDIO_TOKEN__?: string;
  // Present in Tauri webviews — used to detect the runtime
  __TAURI_INTERNALS__?: unknown;
  studio?: {
    showInFinder: (path: string) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
    platform: string;
    pickFolder: () => Promise<string | null>;
    getProjectDir: () => Promise<string | null>;
    setProjectDir: (dir: string) => Promise<boolean>;
    getRecentProjects?: () => Promise<Array<{ name: string; dir: string; lastOpened: number }>>;
    onMenu?: (channel: string, handler: (...args: unknown[]) => void) => (() => void);
    setDockBadge?: (count: string) => Promise<void>;
    onWindowFocus?: (handler: () => void) => (() => void);
    onUpdateAvailable?: (handler: (info: { version: string }) => void) => (() => void);
    onUpdateDownloaded?: (handler: (info: { version: string }) => void) => (() => void);
    installUpdate?: () => Promise<void>;
  };
  SpeechRecognition: typeof SpeechRecognition;
  webkitSpeechRecognition: typeof SpeechRecognition;
}
