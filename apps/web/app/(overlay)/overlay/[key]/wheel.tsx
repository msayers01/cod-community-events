"use client";
import { useEffect, useRef, useState } from "react";
import type { OverlayState as State } from "@cod/realtime";
import { getRealtimeSocket } from "@/lib/realtime-client";

type Phase = "idle" | "spinning" | "result";

/**
 * OBS overlay. Display only: it receives state pushed by the real-time server
 * and animates to whatever the server decided. If the socket is unavailable it
 * falls back to a slow poll so a stream never goes dark.
 */
export function Wheel({ overlayKey }: { overlayKey: string }) {
  const [state, setState] = useState<State | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [highlight, setHighlight] = useState(0);
  const animatedSpinId = useRef<string | null>(null);
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;

    const animate = () => {
      let speed = 60;
      const step = () => {
        if (!alive) return;
        setHighlight((h) => h + 1);
        speed *= 1.06;
        if (speed < 600) animTimer.current = setTimeout(step, speed);
        else setPhase("result");
      };
      step();
    };

    const applyState = (next: State) => {
      setState(next);
      const spin = next.spin;
      if (!spin || spin.status === "COMMITTED") {
        animatedSpinId.current = null;
        setPhase("idle");
      } else if (spin.status === "REVEALED" && animatedSpinId.current !== spin.id) {
        animatedSpinId.current = spin.id;
        setPhase("spinning");
        animate();
      }
    };

    const tick = async () => {
      try {
        const r = await fetch(`/api/overlay/${overlayKey}`, { cache: "no-store" });
        if (!r.ok || !alive) return;
        applyState(await r.json());
      } catch {
        /* retry next tick */
      }
    };
    tick(); // initial state

    const socket = getRealtimeSocket();
    let poll: ReturnType<typeof setInterval> | null = null;
    const startPoll = (ms: number) => {
      if (!poll) poll = setInterval(tick, ms);
    };
    const stopPoll = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };

    if (!socket) {
      startPoll(2000);
    } else {
      const onConnect = () => {
        stopPoll();
        socket.emit("join.overlay", overlayKey);
        tick();
      };
      const onDisconnect = () => startPoll(5000);
      const onState = (next: State) => {
        if (alive) applyState(next);
      };
      socket.on("connect", onConnect);
      socket.on("disconnect", onDisconnect);
      socket.on("overlay.state", onState);
      if (socket.connected) onConnect();
      else startPoll(5000);
      return () => {
        alive = false;
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
        socket.off("overlay.state", onState);
        stopPoll();
        if (animTimer.current) clearTimeout(animTimer.current);
      };
    }
    return () => {
      alive = false;
      stopPoll();
      if (animTimer.current) clearTimeout(animTimer.current);
    };
  }, [overlayKey]);

  if (!state) return null;
  const names = state.pool;
  const n = Math.max(names.length, 1);
  const teams = state.spin?.teams ?? [];

  return (
    <div
      className="flex h-screen w-screen items-center justify-center font-sans text-white"
      style={{ textShadow: "0 2px 8px rgba(0,0,0,.8)" }}
    >
      {phase !== "result" ? (
        <div className="relative" style={{ width: 640, height: 640 }}>
          <svg
            viewBox="-1 -1 2 2"
            className="h-full w-full"
            style={{ transform: "rotate(-90deg)" }}
          >
            {names.map((name, i) => {
              const a0 = (i / n) * 2 * Math.PI;
              const a1 = ((i + 1) / n) * 2 * Math.PI;
              const large = a1 - a0 > Math.PI ? 1 : 0;
              const d = `M0 0 L${Math.cos(a0)} ${Math.sin(a0)} A1 1 0 ${large} 1 ${Math.cos(a1)} ${Math.sin(a1)} Z`;
              const active = phase === "spinning" && highlight % n === i;
              return (
                <path
                  key={name}
                  d={d}
                  fill={active ? "#f2a93b" : i % 2 ? "#1f2735" : "#2b3446"}
                  stroke="#0b0d12"
                  strokeWidth={0.01}
                />
              );
            })}
          </svg>
          {names.map((name, i) => {
            const a = ((i + 0.5) / n) * 2 * Math.PI - Math.PI / 2;
            return (
              <span
                key={name}
                className="absolute text-sm font-semibold"
                style={{
                  left: `calc(50% + ${Math.cos(a) * 240}px)`,
                  top: `calc(50% + ${Math.sin(a) * 240}px)`,
                  transform: "translate(-50%,-50%)",
                }}
              >
                {name}
              </span>
            );
          })}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-[#0b0d12]/90 px-6 py-4 text-center">
              <p className="text-xs uppercase tracking-widest text-[#f2a93b]">{state.title}</p>
              <p className="text-2xl font-bold">
                {state.round ? `Round ${state.round.number}` : "Waiting"}
              </p>
              {state.spin?.status === "COMMITTED" && (
                <p className="mt-1 font-mono text-[10px] text-white/60">
                  locked · {state.spin.commitment.slice(0, 16)}…
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          className="grid gap-6"
          style={{
            gridTemplateColumns: `repeat(${Math.min(teams.length, 4)}, minmax(220px, 1fr))`,
          }}
        >
          {teams.map((t, i) => (
            <div key={i} className="rounded-xl border border-[#f2a93b]/60 bg-[#0b0d12]/90 p-5">
              <p className="mb-2 text-xs uppercase tracking-widest text-[#f2a93b]">
                Team {String.fromCharCode(65 + i)}
              </p>
              {t.map((m) => (
                <p key={m} className="text-xl font-bold">
                  {m}
                </p>
              ))}
            </div>
          ))}
          {state.spin?.revealedSecret && (
            <p className="col-span-full text-center font-mono text-[10px] text-white/50">
              verified · secret {state.spin.revealedSecret.slice(0, 12)}… · round{" "}
              {state.round?.number}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
