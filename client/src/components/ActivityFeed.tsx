import { useEffect, useRef } from "react";
import ToolEvent, { type ToolEventData } from "./ToolEvent";

interface ActivityFeedProps {
  events: ToolEventData[];
  totalElapsed?: number;
  maxHeight?: number;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function ActivityFeed({ events, totalElapsed = 0, maxHeight = 400 }: ActivityFeedProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [events.length]);

  return (
    <div className="activity-feed">
      <div className="activity-feed-header">
        <span>activity</span>
        <span>{fmtTime(totalElapsed)}</span>
      </div>
      <div className="activity-feed-body" ref={bodyRef} style={{ maxHeight }}>
        {events.length === 0 && (
          <div style={{
            padding: "24px 12px",
            textAlign: "center",
            fontFamily: "var(--font)",
            fontSize: 11,
            color: "var(--text-dimmer)",
          }}>
            Waiting for agent activity...
          </div>
        )}
        {events.map((ev) => (
          <ToolEvent key={ev.id} event={ev} />
        ))}
      </div>
    </div>
  );
}

export type { ToolEventData };
