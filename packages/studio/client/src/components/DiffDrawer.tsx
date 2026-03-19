import { useState, useEffect } from "react";

interface DiffFile { path: string; added: number; removed: number; status: string; }

export default function DiffDrawer({ open, onClose }: { open: boolean; onClose: () => void; projectDir: string }) {
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diff, setDiff] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    fetch('/api/files/git')
      .then(r => r.json())
      .then((d: { files?: DiffFile[] }) => {
        const changed = (d.files ?? []).filter((f: DiffFile) => f.status !== '?');
        setFiles(changed);
        if (changed.length > 0) setSelectedFile(changed[0].path);
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!selectedFile) return;
    fetch(`/api/files/diff?path=${encodeURIComponent(selectedFile)}`)
      .then(r => r.json())
      .then((d: { diff?: string }) => setDiff(d.diff ?? ''))
      .catch(() => {});
  }, [selectedFile]);

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      width: 480, background: 'var(--bg-2)',
      borderLeft: '1px solid var(--border-dim)',
      display: 'flex', flexDirection: 'column',
      zIndex: 50,
      transform: open ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform 0.2s ease',
      pointerEvents: open ? 'auto' : 'none',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border-dim)', flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--text-dim)' }}>
          Changes {files.length}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dimmer)', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>
      {/* File list + diff */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: 180, borderRight: '1px solid var(--border-dim)', overflow: 'auto', flexShrink: 0 }}>
          {files.map(f => (
            <button key={f.path} onClick={() => setSelectedFile(f.path)}
              style={{
                width: '100%', textAlign: 'left', padding: '6px 10px',
                background: selectedFile === f.path ? 'var(--active-bg)' : 'none',
                border: 'none', color: 'var(--text-dim)', fontSize: 11,
                fontFamily: 'var(--font)', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.path.split('/').pop()}
              </span>
              <span style={{ fontSize: 10, color: 'var(--accent)', flexShrink: 0 }}>+{f.added ?? 0}</span>
            </button>
          ))}
        </div>
        {/* Diff view */}
        <div style={{ flex: 1, overflow: 'auto', fontFamily: 'var(--font)', fontSize: 11, lineHeight: 1.5 }}>
          {diff.split('\n').map((line, i) => (
            <div key={i} style={{
              padding: '0 12px',
              background: line.startsWith('+') && !line.startsWith('+++') ? 'var(--accent-bg)'
                : line.startsWith('-') && !line.startsWith('---') ? 'var(--red-bg)' : 'transparent',
              color: line.startsWith('+') && !line.startsWith('+++') ? 'var(--accent)'
                : line.startsWith('-') && !line.startsWith('---') ? 'var(--red)'
                : line.startsWith('@@') ? 'var(--blue)' : 'var(--text-dim)',
            }}>
              {line || '\u00a0'}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
