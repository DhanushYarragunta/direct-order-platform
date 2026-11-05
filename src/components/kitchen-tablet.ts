"use client";
import { useEffect, useRef, useState } from "react";
import type { Order } from "@/lib/types";

function chime(context: AudioContext) {
  const at = context.currentTime;
  [660, 880, 660].forEach((frequency, i) => {
    const tone = context.createOscillator(), volume = context.createGain();
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0, at + i * 0.22);
    volume.gain.linearRampToValueAtTime(0.18, at + i * 0.22 + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.001, at + i * 0.22 + 0.2);
    tone.connect(volume); volume.connect(context.destination);
    tone.start(at + i * 0.22); tone.stop(at + i * 0.22 + 0.21);
    tone.onended = () => { tone.disconnect(); volume.disconnect(); };
  });
}
export function useKitchenTablet(outletId: string, orders: Order[] | undefined) {
  const audio = useRef<AudioContext | null>(null),
    seen = useRef<{ outlet: string; ids: Set<string> } | null>(null),
    lock = useRef<WakeLockSentinel | null>(null),
    wantsWake = useRef(false),
    wantsSound = useRef(false);
  const [sound, setSound] = useState<"off" | "on" | "paused">("off"),
    [wakeEnabled, setWakeEnabled] = useState(false),
    [awake, setAwake] = useState(false),
    [notice, setNotice] = useState("");

  async function toggleSound() {
    try {
      if (sound === "on") {
        wantsSound.current = false; await audio.current?.suspend(); setSound("off"); setNotice("Sound disabled."); return;
      }
      const context = audio.current ?? new AudioContext();
      audio.current = context;
      wantsSound.current = true;
      context.onstatechange = () => {
        if (wantsSound.current && context.state !== "running") {
          setSound("paused"); setNotice("Sound paused by this browser. Tap Enable sound to resume alerts.");
        }
      };
      await context.resume();
      if (context.state !== "running") throw new Error("Sound is paused by this browser. Tap to enable it again.");
      setSound("on"); setNotice("Sound enabled. New paid orders will chime."); chime(context);
    } catch {
      setSound("paused"); setNotice("Sound could not start. Check the tablet volume and tap Enable sound again.");
    }
  }
  useEffect(() => {
    if (!orders) return;
    const ids = new Set(orders.map((order) => order.id));
    const previous = seen.current;
    if (previous?.outlet === outletId && orders.some((order) => order.status === "PLACED" && !previous.ids.has(order.id)) && sound === "on") {
      if (audio.current?.state === "running") chime(audio.current);
      else { setSound("paused"); setNotice("Sound paused. Tap Enable sound to resume new-order alerts."); }
    }
    seen.current = { outlet: outletId, ids };
  }, [orders, outletId, sound]);

  useEffect(() => {
    let alive = true, requesting = false;
    wantsWake.current = wakeEnabled;
    async function acquire() {
      if (!wakeEnabled || document.visibilityState !== "visible" || lock.current || requesting) return;
      if (!("wakeLock" in navigator)) {
        setNotice("Screen wake lock is unavailable here. Use your tablet's display settings to prevent sleep.");
        setWakeEnabled(false); return;
      }
      requesting = true;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (!alive || !wantsWake.current) { await sentinel.release(); return; }
        lock.current = sentinel; setAwake(true); setNotice("Screen will stay awake while this kitchen is visible.");
        sentinel.addEventListener("release", () => {
          if (lock.current === sentinel) lock.current = null;
          if (alive) setAwake(false);
        });
      } catch {
        if (alive) { setAwake(false); setNotice("Screen wake lock was blocked. Check power-saving settings or try again."); }
      } finally { requesting = false; }
    }
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      alive = false; wantsWake.current = false;
      document.removeEventListener("visibilitychange", acquire);
      const previous = lock.current; lock.current = null;
      void previous?.release().catch(() => {});
      setAwake(false);
    };
  }, [wakeEnabled]);
  useEffect(() => () => {
    wantsSound.current = false;
    if (audio.current) audio.current.onstatechange = null;
    void audio.current?.close().catch(() => {});
  }, []);

  return { sound, toggleSound, awake, wakeEnabled, notice,
    toggleWake: () => { setNotice(""); setWakeEnabled((enabled) => !enabled); },
  };
}
