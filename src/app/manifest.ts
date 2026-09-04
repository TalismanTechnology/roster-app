import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Roster — The Athlete's Resume",
    short_name: "Roster",
    description: "Every PR, result, award, and clip of film, verified by your coaches, at one link.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
  };
}
