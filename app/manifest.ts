import type { MetadataRoute } from "next";

/** Makes the CRM installable from the browser. Theme and background are the brand green. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QuantraPro CRM",
    short_name: "QuantraPro",
    description: "From first call to verified deposit.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    theme_color: "#08150F",
    background_color: "#08150F",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
