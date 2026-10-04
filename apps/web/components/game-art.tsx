import Image from "next/image";
import { label } from "@/lib/format";

/**
 * Cover art per title, served from /public/games. The covers differ in shape (one landscape,
 * two portrait, one square), so each has the focal point to keep when it is cropped into a banner.
 */
const ART: Record<string, { src: string; focus: string }> = {
  MW3: { src: "/games/mw3.webp", focus: "50% 34%" },
  BO6: { src: "/games/bo6.webp", focus: "50% 54%" },
  BO7: { src: "/games/bo7.webp", focus: "50% 88%" },
  MW4: { src: "/games/mw4.webp", focus: "50% 4%" },
};

/** A cropped cover banner for the game, or nothing when the event has no game set. */
export function GameArt({
  game,
  className = "h-28",
  priority = false,
}: {
  game: string | null | undefined;
  /** Sizing/rounding for the frame, e.g. "h-28" or "h-44 rounded". */
  className?: string;
  priority?: boolean;
}) {
  const art = game ? ART[game] : undefined;
  if (!game || !art) return null;
  return (
    <div className={`relative w-full overflow-hidden bg-bg ${className}`}>
      <Image
        src={art.src}
        alt={`${label(game)} cover art`}
        fill
        sizes="(min-width: 1024px) 700px, 100vw"
        className="object-cover"
        style={{ objectPosition: art.focus }}
        priority={priority}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-panel/70 via-transparent to-transparent" />
    </div>
  );
}
