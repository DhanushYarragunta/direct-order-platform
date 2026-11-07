import type { Metadata } from "next";
import { connection } from "next/server";
import { Provider } from "@/components/provider";
import { Shell } from "@/components/shell";
import "./globals.css";
import "@/components/live-services.css";
export const metadata: Metadata = {
  title: "Deccan Kitchen — A taste of Hyderabad",
  description:
    "Biryani, slow-cooked classics, and something sweet. Order directly from your neighbourhood kitchen.",
  icons: { apple: "/icons/kitchen-192.png" },
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fresh responses are required so framework scripts receive this request's CSP nonce.
  await connection();
  return (
    <html lang="en">
      <body>
        <Provider demoMode={process.env.DEMO_MODE === "true"}>
          <Shell>{children}</Shell>
        </Provider>
      </body>
    </html>
  );
}
