"use client";
import { useApp } from "./provider";
import { CodeSignIn } from "./code-sign-in";
export function PhoneSignIn({ complete }: { complete: (role: string) => Promise<void> }) {
  const app = useApp();
  return <CodeSignIn channel="phone" demoMode={app.demoMode} complete={complete} />;
}
