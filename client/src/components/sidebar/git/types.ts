export interface GitFile {
  status: string;
  file: string;
  x: string;
  y: string;
  isStaged: boolean;
  isUnstaged: boolean;
  isUntracked: boolean;
  added?: number;
  removed?: number;
}

export interface GitData {
  branch: string;
  ahead: number;
  behind: number;
  files: GitFile[];
  error?: string;
}

export interface OutgoingCommit {
  hash: string;
  message: string;
  date: string;
}

export const STATUS_COLOR: Record<string, string> = {
  M: "var(--yellow)",
  A: "var(--green)",
  D: "var(--red)",
  "?": "var(--green)",
  U: "var(--green)",
  R: "var(--blue)",
  C: "var(--cyan)",
};
