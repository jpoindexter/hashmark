"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from '@/components/ui/button'

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

function useHydrated() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();

  if (!hydrated) {
    return (
      <div className="flex items-center gap-[var(--grid-1)] border border-border p-0.5">
        <div className="p-[var(--grid-1)].5"><Monitor className="size-3.5" /></div>
      </div>
    );
  }

  const options = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "dark", icon: Moon, label: "Dark" },
    { value: "system", icon: Monitor, label: "System" },
  ] as const;

  return (
    <div className="flex items-center gap-0 border border-border">
      {options.map(({ value, icon: Icon, label }) => (
        <Button
          key={value}
          onClick={() => setTheme(value)}
          className={`p-[var(--grid-1)].5 transition-colors ${
            theme === value
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          title={label}
          aria-label={`Switch to ${label} theme`}
        >
          <Icon className="size-3.5" />
        </Button>
      ))}
    </div>
  );
}
