export function ToolIcon({ name, color }: { name: string; color: string }) {
  const n = name.toLowerCase();
  if (n === "bash" || n === "execute_bash") {
    return (
      <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke={color} strokeWidth="1.2">
        <rect x="1" y="1" width="10" height="10" rx="1" />
        <path d="M3.5 4.5L5.5 6L3.5 7.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.5 7.5H8.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (n === "read" || n === "readfile") {
    return (
      <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke={color} strokeWidth="1.2">
        <path d="M2 2h6l2 2v7H2V2z" strokeLinejoin="round" />
        <path d="M8 2v2h2" strokeLinejoin="round" />
        <path d="M4 6h4M4 8h3" strokeLinecap="round" />
      </svg>
    );
  }
  if (n === "write" || n === "writefile") {
    return (
      <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke={color} strokeWidth="1.2">
        <path d="M7.5 2.5l2 2-5 5H2.5v-2l5-5z" strokeLinejoin="round" />
        <path d="M6.5 3.5l2 2" />
      </svg>
    );
  }
  if (n === "edit" || n === "editfile") {
    return (
      <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke={color} strokeWidth="1.2">
        <path d="M2 9.5v-3l5.5-5.5 3 3L5 9.5H2z" strokeLinejoin="round" />
        <path d="M7.5 1l3 3" />
      </svg>
    );
  }
  if (n === "glob") {
    return (
      <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke={color} strokeWidth="1.2">
        <circle cx="6" cy="6" r="4.5" />
        <path d="M6 1.5v9M1.5 6h9" strokeLinecap="round" />
        <path d="M2.5 3C4 4 6 4.5 9.5 3M2.5 9c1.5-1 3.5-1.5 7-0.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (n === "grep") {
    return (
      <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke={color} strokeWidth="1.2">
        <circle cx="5" cy="5" r="3.5" />
        <path d="M7.5 7.5L10.5 10.5" strokeLinecap="round" />
        <path d="M3.5 5h3M5 3.5v3" strokeLinecap="round" />
      </svg>
    );
  }
  if (n === "web_search" || n === "websearch") {
    return (
      <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke={color} strokeWidth="1.2">
        <circle cx="6" cy="6" r="4.5" />
        <path d="M6 1.5v9M1.5 6h9" strokeLinecap="round" />
        <ellipse cx="6" cy="6" rx="2" ry="4.5" />
      </svg>
    );
  }
  if (n === "web_fetch" || n === "webfetch") {
    return (
      <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke={color} strokeWidth="1.2">
        <rect x="1" y="2" width="10" height="8" rx="1" />
        <path d="M1 4.5h10" strokeLinecap="round" />
        <circle cx="3" cy="3.25" r="0.5" fill={color} stroke="none" />
        <circle cx="5" cy="3.25" r="0.5" fill={color} stroke="none" />
      </svg>
    );
  }
  if (n === "todowrite" || n === "todoread") {
    return (
      <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke={color} strokeWidth="1.2">
        <path d="M2 2h8v8H2V2z" strokeLinejoin="round" />
        <path d="M4 5l1.5 1.5L8 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (n === "agent") {
    return (
      <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke={color} strokeWidth="1.2">
        <rect x="2" y="1" width="8" height="7" rx="1.5" />
        <path d="M4 4h4M4 6h2" strokeLinecap="round" />
        <path d="M4 8v2M8 8v2M3 10h6" strokeLinecap="round" />
      </svg>
    );
  }
  // Generic fallback: wrench/tool
  return (
    <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke={color} strokeWidth="1.2">
      <path d="M8.5 2a2.5 2.5 0 0 0-2.45 3L2 9l1 1 4-4.05A2.5 2.5 0 1 0 8.5 2z" strokeLinejoin="round" />
    </svg>
  );
}
