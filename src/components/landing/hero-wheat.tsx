// Round to 4dp so Node.js and browser V8 produce identical strings, avoiding hydration mismatches
const r = (n: number) => Math.round(n * 10000) / 10000;

const WHEAT_NEAR = Array.from({ length: 80 }, (_, i) => ({
  x: r(i * 6 + Math.sin(i * 2.4) * 3),
  h: r(55 + Math.sin(i * 1.7) * 20),
  sway: r(Math.sin(i * 0.8) * 4),
  baseY: r(500 + Math.cos(i * 1.1) * 8),
  op: r(0.7 + Math.sin(i) * 0.3),
  stroke: i % 3 === 0 ? "#C08010" : i % 3 === 1 ? "#B87818" : "#D09020",
  fill: i % 3 === 0 ? "#C89028" : "#B07820",
}));

const WHEAT_MID = Array.from({ length: 65 }, (_, i) => ({
  x: r(i * 7.5 - 8 + Math.cos(i * 1.9) * 4),
  h: r(70 + Math.sin(i * 1.3) * 25),
  sway: r(Math.cos(i * 0.9) * 5),
  baseY: r(560 + Math.sin(i * 0.7) * 10),
  op: r(0.85 + Math.cos(i) * 0.15),
  stroke: i % 2 === 0 ? "#B07010" : "#C88018",
  fill: i % 2 === 0 ? "#B88020" : "#A07018",
}));

const WHEAT_FAR = Array.from({ length: 45 }, (_, i) => ({
  x: r(i * 10 - 5 + Math.sin(i * 2.1) * 5),
  h: r(90 + Math.cos(i * 1.1) * 30),
  sway: r(Math.sin(i * 0.6) * 7),
  baseY: r(640 + Math.cos(i * 0.5) * 12),
  op: r(0.9 + Math.sin(i * 1.2) * 0.1),
  stroke: i % 3 === 0 ? "#886010" : i % 3 === 1 ? "#A07018" : "#986818",
  fill: i % 2 === 0 ? "#907018" : "#886010",
  leafStroke: i % 2 === 0 ? "#A07820" : "#907018",
}));

export function WheatStalks() {
  return (
    <>
      {WHEAT_NEAR.map((w, i) => (
        <g key={i} opacity={w.op}>
          <path
            d={`M${w.x},${w.baseY + w.h} C${w.x + w.sway},${w.baseY + w.h * 0.6} ${w.x + w.sway * 0.5},${w.baseY + w.h * 0.3} ${w.x},${w.baseY}`}
            stroke={w.stroke}
            strokeWidth="1"
            fill="none"
          />
          <ellipse
            cx={w.x} cy={w.baseY - 4} rx="3" ry="7"
            fill={w.fill}
            transform={`rotate(${w.sway * 3}, ${w.x}, ${w.baseY - 4})`}
          />
        </g>
      ))}
      {WHEAT_MID.map((w, i) => (
        <g key={`w2-${i}`} opacity={w.op}>
          <path
            d={`M${w.x},${w.baseY + w.h} C${w.x + w.sway},${w.baseY + w.h * 0.5} ${w.x + w.sway * 0.3},${w.baseY + w.h * 0.2} ${w.x},${w.baseY}`}
            stroke={w.stroke}
            strokeWidth="1.2"
            fill="none"
          />
          <ellipse
            cx={w.x} cy={w.baseY - 5} rx="3.5" ry="9"
            fill={w.fill}
            transform={`rotate(${w.sway * 2}, ${w.x}, ${w.baseY - 5})`}
          />
        </g>
      ))}
      {WHEAT_FAR.map((w, i) => (
        <g key={`w3-${i}`} opacity={w.op}>
          <path
            d={`M${w.x},${w.baseY + w.h} C${w.x + w.sway},${w.baseY + w.h * 0.5} ${w.x + w.sway * 0.4},${w.baseY + w.h * 0.15} ${w.x + w.sway * 0.2},${w.baseY}`}
            stroke={w.stroke}
            strokeWidth="1.5"
            fill="none"
          />
          <ellipse
            cx={w.x + w.sway * 0.2} cy={w.baseY - 6} rx="4" ry="11"
            fill={w.fill}
            transform={`rotate(${w.sway * 1.5}, ${w.x}, ${w.baseY - 6})`}
          />
          <path
            d={`M${w.x},${w.baseY + w.h * 0.4} C${w.x + 12},${w.baseY + w.h * 0.3} ${w.x + 14},${w.baseY + w.h * 0.2} ${w.x + 8},${w.baseY + w.h * 0.15}`}
            stroke={w.leafStroke}
            strokeWidth="1"
            fill="none"
          />
        </g>
      ))}
    </>
  );
}
