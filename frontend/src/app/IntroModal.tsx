"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export default function IntroModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = sessionStorage.getItem("introModalDismissed");
      if (!dismissed) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    try {
      sessionStorage.setItem("introModalDismissed", "1");
    } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-[92%] max-w-lg rounded-2xl border border-white/10 bg-zinc-900/90 p-6 shadow-2xl">
        <div className="flex items-center space-x-4">
          <div className="shrink-0 rounded-xl bg-zinc-800 p-2 ring-1 ring-white/10">
            <Image src="/Logo.png" alt="Logo" width={48} height={48} priority />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-white">
              LATTICE
            </div>
            <div className="text-sm text-zinc-400">
              Interactive data center defense demo
            </div>
          </div>
        </div>

        <div className="mt-4 text-sm leading-6 text-zinc-300">
          Explore a hands-on, gesture-powered experience of data-center
          resilience. Inspired by{" "}
          <span className="font-medium text-[#3c79bc]">Astera Labs</span>.
          <div className="mt-3 space-y-1 text-zinc-400">
            <div>
              • Play with hardware topology and visualize live telemetry
            </div>
            <div>
              • Understand link/utilization, latency, errors, and thermal
              behavior
            </div>
            <div>
              • Practice responses to simulated failures and network events
            </div>
            <div>
              • Use gestures to heal, reroute, shield, or cut under attack
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-white/5"
            onClick={handleDismiss}
          >
            OK
          </button>
        </div>

        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/10" />
      </div>
    </div>
  );
}
