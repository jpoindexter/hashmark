// Re-exports the toast API and a hook for reading toast state.
// The event bus lives in Toasts.tsx — this file is the hook-friendly surface.

export { toast } from "../components/Toasts.tsx";
export { useToasts } from "../components/Toasts.tsx";
