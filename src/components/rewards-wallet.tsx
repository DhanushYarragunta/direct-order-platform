"use client";
import { useResource } from "@/lib/client";
import { ErrorNotice } from "./ui";
import "./rewards.css";

type Wallet = {
  balance: number;
  entries: { id: string; kind: string; points: number; createdAt: string; order: { number: string } | null }[];
  coupons: { code: string; description: string }[];
};
const labels: Record<string, string> = { OPENING: "Demo starting points", EARN: "Earned on your meal", REDEEM: "Reserved for checkout", RELEASE: "Points returned" };

export function RewardsWallet() {
  const resource = useResource<Wallet>("/api/rewards", "/api/events?scope=orders");
  return <section className="panel rewards-wallet" aria-label="Your loyalty rewards">
    <div className="rewards-wallet-header">
      <div><h2>A little thank you, every time.</h2><p>Earn 1 point per ₹100 paid after handoff. Each point is worth ₹1.</p></div>
      <div className="rewards-balance">{resource.data?.balance ?? "…"} <small>available points</small></div>
    </div>
    {resource.error && <ErrorNotice message={resource.error} retry={resource.refresh} />}
    {resource.data && <>
      <div className="reward-coupons">{resource.data.coupons.map((coupon) => <p key={coupon.code}><strong>{coupon.code}</strong> · {coupon.description}</p>)}</div>
      <details><summary>Points activity</summary>
        <p>Points used at checkout are held for up to 15 minutes, including payment retries. Cancellation or expiry returns them automatically.</p>
        {resource.data.entries.length ? <ul className="reward-ledger">{resource.data.entries.map((entry) => <li key={entry.id}>
          <span>{labels[entry.kind] || entry.kind}<small>{entry.order?.number || "Rewards account"} · {new Date(entry.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</small></span>
          <strong>{entry.points > 0 ? "+" : ""}{entry.points}</strong>
        </li>)}</ul> : <p>Your points activity will appear after your first completed meal.</p>}
      </details>
    </>}
  </section>;
}
