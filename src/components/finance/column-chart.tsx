"use client";

import { useState } from "react";

type Point = { label: string; value: number; display: string };

// Gráfico de colunas de uma única série (sem legenda: o título diz o que é).
// Colunas finas (até 24px) com topo arredondado, grade fina, dica ao passar o mouse/foco
// e tabela equivalente para leitores de tela e para conferência.
export function ColumnChart({ title, points, color = "var(--brand)", unit }: { title: string; points: Point[]; color?: string; unit: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.value));
  const niceMax = (() => {
    const pow = 10 ** Math.floor(Math.log10(max));
    return Math.ceil(max / pow) * pow;
  })();
  const W = 640;
  const H = 180;
  const padL = 36;
  const padB = 22;
  const band = (W - padL) / points.length;
  const barW = Math.min(24, band * 0.6);
  const y = (v: number) => H - padB - ((H - padB - 8) * v) / niceMax;
  const ticks = [0, niceMax / 2, niceMax];
  const fmtTick = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}K` : String(Math.round(v)));

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}: ${points.length} dias`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
                {fmtTick(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const x = padL + band * i + (band - barW) / 2;
            const top = y(p.value);
            const h = H - padB - top;
            const r = Math.min(4, h / 2, barW / 2);
            return (
              <g key={p.label} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
                {/* área de toque maior que a coluna */}
                <rect x={padL + band * i} y={0} width={band} height={H - padB} fill="transparent" />
                {p.value > 0 && (
                  <path
                    d={`M${x},${H - padB} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${H - padB} Z`}
                    fill={color}
                    opacity={active === null || active === i ? 1 : 0.45}
                  />
                )}
              </g>
            );
          })}
          <line x1={padL} x2={W} y1={H - padB} y2={H - padB} stroke="var(--muted)" strokeWidth={1} />
          {/* Primeiro e último rótulos alinhados às bordas do gráfico, para não serem cortados. */}
          {[0, Math.floor(points.length / 2), points.length - 1].map((i, k) => (
            <text
              key={i}
              x={k === 0 ? padL : k === 2 ? W : padL + band * i + band / 2}
              y={H - 6}
              textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"}
              fontSize={11}
              fill="var(--muted)"
            >
              {points[i]?.label}
            </text>
          ))}
        </svg>
        {active !== null && points[active] && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 rounded-md border border-line bg-surface px-2 py-1 text-xs shadow-sm"
            style={{ left: `${((padL + band * active + band / 2) / W) * 100}%`, transform: "translateX(-50%)" }}
          >
            <span className="text-muted">{points[active].label}: </span>
            <span className="font-medium">{points[active].display}</span>
          </div>
        )}
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted">Ver tabela ({unit})</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-muted">
              <th scope="col" className="py-1 font-medium">Dia</th>
              <th scope="col" className="py-1 text-right font-medium">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.label}>
                <td className="py-0.5">{p.label}</td>
                <td className="py-0.5 text-right tabular-nums">{p.display}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
