import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/kitchen",
    name: "Deccan Kitchen Display",
    short_name: "Deccan Kitchen",
    description: "Live kitchen tickets, preparation timers and handoff.",
    start_url: "/kitchen",
    scope: "/",
    display: "standalone",
    background_color: "#f2f4ed",
    theme_color: "#173e28",
    icons: [
      { src: "/icons/kitchen-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/kitchen-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
