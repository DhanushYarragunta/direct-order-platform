"use client";
import { useState } from "react";
import { Heart } from "lucide-react";
import { request } from "@/lib/client";
import { useApp } from "./provider";
import "./customer-completion.css";

export function FavoriteButton({ itemId, name }: { itemId: string; name: string }) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  if (app.user?.role !== "CUSTOMER") return null;
  const saved = !!app.profile.data?.favorites?.some(item => item.itemId === itemId);
  async function toggle() {
    if (busy) return;
    setBusy(true);
    const owner = app.user!.id;
    try {
      const value = await request<{ itemId: string; saved: boolean }>("/api/account/favorites", "PUT", { itemId, saved: !saved });
      app.profile.mutate(profile => profile?.id === owner ? { ...profile,
        favorites: [...(profile.favorites || []).filter(item => item.itemId !== itemId), ...(value.saved ? [{ itemId }] : [])],
      } : profile);
      app.setToast(value.saved ? "Saved to your favourites" : "Removed from favourites");
    } catch (error) { app.setToast((error as Error).message); }
    finally { setBusy(false); }
  }
  return <button type="button" className={`favorite-button ${saved ? "saved" : ""}`} aria-pressed={saved}
    aria-label={`${saved ? "Remove" : "Save"} ${name} ${saved ? "from" : "to"} favourites`}
    disabled={busy || !app.profile.data} onClick={() => void toggle()}><Heart size={20} fill={saved ? "currentColor" : "none"} /></button>;
}
