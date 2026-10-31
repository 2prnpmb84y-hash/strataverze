import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StrataVerze",
    short_name: "StrataVerze",
    description: "Strata management platform",
    // The app's identity. Without an id, browsers derive it from start_url,
    // so moving start_url from "/" would make existing installs a new app.
    id: "/",
    // The installed app opens on the dashboard (or sign-in), not the root,
    // which sends signed-out visitors to the public site.
    start_url: "/dashboard",
    display: "standalone",
    theme_color: "#1A2028",
    background_color: "#FFFFFF",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
