"use client";

import { useState } from "react";
import { Button } from "@fabrk/components";

const plans = [
  {
    name: "FREE",
    label: "Individual",
    monthly: "$0",
    yearly: "$0",
    period: "/mo",
    description: "For open-source maintainers and solo devs.",
    features: [
      "1 connected repo",
      "Manual scan via web UI",
      "Download all 7 formats",
      "Basic dashboard",
    ],
    cta: "Get Started",
    href: "/login",
    highlighted: false,
  },
  {
    name: "PRO",
    label: "Pro",
    monthly: "$19",
    yearly: "$15",
    period: "/mo",
    description: "For individuals who ship fast.",
    features: [
      "Unlimited repos",
      "Auto-sync via GitHub Action",
      "Full codebase intelligence dashboard",
      "Custom rules",
      "Scan history with diffs",
    ],
    cta: "Start Trial",
    href: "/login",
    highlighted: true,
  },
  {
    name: "TEAM",
    label: "Team",
    monthly: "$29",
    yearly: "$23",
    period: "/seat/mo",
    description: "For teams building at scale.",
    features: [
      "Everything in Pro",
      "Org-wide rules across all repos",
      "Team dashboard",
      "Invite team members",
      "Shared custom rules library",
    ],
    cta: "Contact Us",
    href: "mailto:hello@theft.studio",
    highlighted: false,
  },
];

export function PricingTable() {
  const [yearly, setYearly] = useState(false);

  return (
    <section id="pricing" className="py-24 border-t border-zinc-800/50">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center mb-16">
          <p className="text-xs font-mono text-zinc-500 tracking-widest uppercase mb-4">
            &mdash; PRICING
          </p>
          <h2 className="text-4xl font-bold mb-4">Scalable Precision</h2>
          <p className="text-zinc-400 mb-8">Free to start. Pay when you need auto-sync.</p>

          {/* Toggle */}
          <div className="inline-flex p-1 bg-zinc-800 rounded-lg border border-zinc-700">
            <Button onClick={() => setYearly(false)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                !yearly ? "bg-zinc-700 text-on-surface" : "text-zinc-400 hover:text-on-surface"
              }`}>
              Monthly
            </Button>
            <Button onClick={() => setYearly(true)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                yearly ? "bg-zinc-700 text-on-surface" : "text-zinc-400 hover:text-on-surface"
              }`}>
              Yearly <span className="text-emerald-500">(-20%)</span></Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`p-8 rounded-2xl flex flex-col ${
                plan.highlighted
                  ? "bg-zinc-800/50 border-2 border-emerald-500/50 relative shadow-[0_0_30px_rgba(16,185,129,0.1)]"
                  : "bg-zinc-800/20 border border-zinc-700/50"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-zinc-900 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                  Most Popular
                </div>
              )}

              <h3 className="text-zinc-400 font-medium mb-2">{plan.label}</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-bold">
                  {yearly ? plan.yearly : plan.monthly}
                </span>
                <span className="text-zinc-500 text-sm">{plan.period}</span>
              </div>
              <p className="text-zinc-400 text-sm mb-8">{plan.description}</p>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm text-zinc-300">
                    <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              <a
                href={plan.href}
                className={`block w-full py-3 rounded-lg text-center font-medium transition-colors ${
                  plan.highlighted
                    ? "bg-emerald-500 text-zinc-900 font-bold hover:bg-emerald-400"
                    : "border border-zinc-700 hover:bg-zinc-800 text-on-surface"
                }`}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
