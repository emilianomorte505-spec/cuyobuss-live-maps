import { createFileRoute } from "@tanstack/react-router";
import { StopPage } from "@/components/StopPage";
import { DEFAULT_STOP } from "@/lib/stops";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cuyobuss — Tu colectivo, sin adivinar" },
      {
        name: "description",
        content:
          "Tocá el tag NFC de tu parada y mirá los próximos colectivos de San Juan en segundos.",
      },
      { property: "og:title", content: "Cuyobuss — Tu colectivo, sin adivinar" },
      {
        property: "og:description",
        content: "Horarios de colectivos de San Juan al alcance de un toque. Sin apps, sin adivinar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <StopPage stop={DEFAULT_STOP} />;
}
