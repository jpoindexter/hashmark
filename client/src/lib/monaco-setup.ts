// Monaco worker setup for Vite
// Uses dynamic import() which Vite handles for both dev and production builds
(self as unknown as { MonacoEnvironment: Record<string, unknown> }).MonacoEnvironment = {
  getWorker(_: string, label: string) {
    const workerMap: Record<string, () => Worker> = {
      json: () => new Worker(new URL("monaco-editor/esm/vs/language/json/json.worker.js", import.meta.url), { type: "module" }),
      css: () => new Worker(new URL("monaco-editor/esm/vs/language/css/css.worker.js", import.meta.url), { type: "module" }),
      scss: () => new Worker(new URL("monaco-editor/esm/vs/language/css/css.worker.js", import.meta.url), { type: "module" }),
      less: () => new Worker(new URL("monaco-editor/esm/vs/language/css/css.worker.js", import.meta.url), { type: "module" }),
      html: () => new Worker(new URL("monaco-editor/esm/vs/language/html/html.worker.js", import.meta.url), { type: "module" }),
      handlebars: () => new Worker(new URL("monaco-editor/esm/vs/language/html/html.worker.js", import.meta.url), { type: "module" }),
      typescript: () => new Worker(new URL("monaco-editor/esm/vs/language/typescript/ts.worker.js", import.meta.url), { type: "module" }),
      javascript: () => new Worker(new URL("monaco-editor/esm/vs/language/typescript/ts.worker.js", import.meta.url), { type: "module" }),
    };
    const factory = workerMap[label];
    if (factory) return factory();
    return new Worker(new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url), { type: "module" });
  },
};
