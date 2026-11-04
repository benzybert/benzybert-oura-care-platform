import type { MetadataRoute } from "next";

/** Lets a member add the app to the home screen: the heart watch and family alerts are a phone-first use. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Oura Care",
    short_name: "Oura Care",
    description: "Heart-health watch, family alerts and personal insights from your Oura ring, with your consent.",
    start_url: "/member",
    scope: "/",
    display: "standalone",
    background_color: "#f4f5f8",
    theme_color: "#2b59d9",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
