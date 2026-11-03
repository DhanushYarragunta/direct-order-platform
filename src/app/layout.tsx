import type { Metadata } from "next";
import { Provider } from "@/components/provider";
import { Shell } from "@/components/shell";
import "./globals.css";
export const metadata: Metadata = {
  title: "Deccan Kitchen — A taste of Hyderabad",
  description:
    "Biryani, slow-cooked classics, and something sweet. Order directly from your neighbourhood kitchen.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
