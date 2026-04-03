import { useRef, useEffect } from "react";
import * as monaco from "monaco-editor";

interface Props {
  original: string;
  modified: string;
  language: string;
  sideBySide: boolean;
}

export default function MonacoDiffEditor({ original, modified, language, sideBySide }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Define dark theme matching hashmark
    monaco.editor.defineTheme("hashmark-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#1a1a1a",
        "editor.foreground": "#e8e4df",
        "editorLineNumber.foreground": "#6a6560",
        "editorGutter.background": "#1a1a1a",
        "diffEditor.insertedTextBackground": "#7dba6a18",
        "diffEditor.removedTextBackground": "#d46a6a18",
        "diffEditor.insertedLineBackground": "#7dba6a0d",
        "diffEditor.removedLineBackground": "#d46a6a0d",
      },
    });

    const editor = monaco.editor.createDiffEditor(containerRef.current, {
      theme: "hashmark-dark",
      readOnly: true,
      renderSideBySide: sideBySide,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 12,
      fontFamily: "JetBrains Mono, Menlo, monospace",
      lineHeight: 18,
      renderOverviewRuler: false,
      diffWordWrap: "on",
    });

    editorRef.current = editor;

    return () => {
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.setModel({
      original: monaco.editor.createModel(original, language),
      modified: monaco.editor.createModel(modified, language),
    });
  }, [original, modified, language]);

  useEffect(() => {
    editorRef.current?.updateOptions({ renderSideBySide: sideBySide });
  }, [sideBySide]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
