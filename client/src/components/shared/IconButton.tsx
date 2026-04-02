import type { ReactNode, MouseEvent } from "react";

interface IconButtonProps {
  children: ReactNode;
  title: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function IconButton({ children, title, onClick, className, style }: IconButtonProps) {
  return (
    <button
      className={`btn-icon${className ? ` ${className}` : ""}`}
      title={title}
      aria-label={title}
      onClick={onClick}
      style={style}
    >
      {children}
    </button>
  );
}
