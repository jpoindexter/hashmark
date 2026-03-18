interface Window {
  studio?: {
    showInFinder: (path: string) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
    platform: string;
    pickFolder: () => Promise<string | null>;
    getProjectDir: () => Promise<string | null>;
    setProjectDir: (dir: string) => Promise<boolean>;
  };
}
