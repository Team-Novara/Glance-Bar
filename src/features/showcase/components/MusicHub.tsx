import { motion, useReducedMotion } from "framer-motion";
import { Pause, SkipBack, SkipForward } from "lucide-react";

import { FluentIconChip, FluentProgressRail } from "./ShowcaseFluentTokens";
import type { MusicState } from "@/entities";

type MusicHubProps = {
  music: MusicState;
};

export function MusicHub({ music }: MusicHubProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.section
      className="hub-card-lg relative flex min-w-[384px] items-center gap-3.5 overflow-hidden rounded-[9999px] bg-[linear-gradient(180deg,rgba(255,255,255,0.72)_0%,rgba(255,255,255,0.52)_100%)] px-4 py-3 text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur-[24px] backdrop-saturate-150 supports-[backdrop-filter]:bg-[linear-gradient(180deg,rgba(255,255,255,0.62)_0%,rgba(253,242,248,0.44)_100%)]"
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: 6, scale: 0.985 }}
      animate={
        prefersReducedMotion
          ? undefined
          : {
              opacity: 1,
              y: [0, -1, 0],
              scale: 1,
            }
      }
      transition={
        prefersReducedMotion
          ? undefined
          : {
              opacity: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
              y: { duration: 4.6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" },
            }
      }
      aria-label={`${music.title}, ${music.subtitle}, playback ${music.time}`}
    >
      <div className="relative z-[1] flex items-center gap-3">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/35 bg-[radial-gradient(circle_at_30%_28%,rgba(255,255,255,0.84),transparent_42%),linear-gradient(145deg,rgba(253,242,248,0.96)_0%,rgba(224,231,255,0.84)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.66),0_6px_16px_rgba(219,39,119,0.14)]">
          <div className="absolute inset-[8px] rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.18)_0%,rgba(236,72,153,0)_72%)] blur-[4px]" />
          <span className="relative z-[1] text-[11px] font-semibold tracking-[0] text-fuchsia-700">
            OST
          </span>
        </div>
        <FluentIconChip mode="music" compact />
      </div>

      <div className="relative z-[1] min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold tracking-[0] text-slate-900">
          {music.title}
        </div>
        <div className="mt-0.5 truncate text-[12px] font-medium tracking-[0] text-slate-600">
          {music.subtitle}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <FluentProgressRail mode="music" value={music.progress} label="Music playback progress" />
          <span className="whitespace-nowrap text-[11px] font-medium tabular-nums text-slate-500">
            {music.time}
          </span>
        </div>
      </div>

      <div className="relative z-[1] flex items-center gap-2 text-slate-700">
        <button
          className="hover:bg-white/58 grid h-8 w-8 place-items-center rounded-full border border-white/35 bg-white/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition-transform duration-150 hover:-translate-y-[1px]"
          type="button"
          aria-label="Previous track"
        >
          <SkipBack size={15} />
        </button>
        <button
          className="grid h-9 w-9 place-items-center rounded-full border border-white/35 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(249,168,212,0.46))] text-fuchsia-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_6px_16px_rgba(236,72,153,0.18)] transition-transform duration-150 hover:-translate-y-[1px]"
          type="button"
          aria-label="Pause playback"
        >
          <Pause size={16} fill="currentColor" />
        </button>
        <button
          className="hover:bg-white/58 grid h-8 w-8 place-items-center rounded-full border border-white/35 bg-white/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition-transform duration-150 hover:-translate-y-[1px]"
          type="button"
          aria-label="Next track"
        >
          <SkipForward size={15} />
        </button>
      </div>
    </motion.section>
  );
}
