// P1 Naman: Tommy's face. Four moods: default, searching (working), celebrating (it went through), winking (hello).
import type { TommyMood } from "@/app/chat/_lib/chatState";

const LABEL: Record<TommyMood, string> = {
  default: "Tommy",
  searching: "Tommy is looking",
  celebrating: "Tommy is celebrating",
  winking: "Tommy says hi",
};

export function TommyAvatar({ mood = "default", size = 40, className = "" }: { mood?: TommyMood; size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny local SVG, no optimization needed
    <img
      src={`/tommy/${mood}.svg`}
      alt={LABEL[mood]}
      width={size}
      height={size}
      draggable={false}
      className={`shrink-0 select-none rounded-full shadow-sm ring-2 ring-gold/70 ${mood === "searching" ? "tommy-bob" : ""} ${mood === "celebrating" ? "tommy-pop" : ""} ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
