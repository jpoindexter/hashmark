import type { CSSProperties, ReactNode } from "react";

type BadgeVariant = "default" | "green" | "blue" | "yellow" | "red" | "purple";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  style?: CSSProperties;
}

const variantClass: Record<BadgeVariant, string> = {
  default: "badge badge-zinc",
  green:   "badge badge-green",
  blue:    "badge badge-blue",
  yellow:  "badge badge-yellow",
  red:     "badge badge-red",
  purple:  "badge badge-purple",
};

export default function Badge({ children, variant = "default", style }: BadgeProps) {
  return (
    <span className={variantClass[variant]} style={style}>
      {children}
    </span>
  );
}
