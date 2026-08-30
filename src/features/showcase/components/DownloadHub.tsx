import { motion, useReducedMotion } from "framer-motion";

import { FluentIconChip, FluentProgressRail } from "./ShowcaseFluentTokens";
import type { HubTask } from "@/entities";

type DownloadHubProps = {
  task: HubTask;
};

export function DownloadHub({ task }: DownloadHubProps) {
  const prefersReducedMotion = useReducedMotion();
  const safeProgress = Number.isFinite(task.progress)
    ? Math.max(0, Math.min(task.progress ?? 0, 100))
    : 0;

  return (
    <motion.section
      className="hub-card-md relative flex min-w-[340px] items-center gap-3.5 overflow-hidden rounded-[9999px] bg-[linear-gradient(180deg,rgba(255,255,255,0.72)_0%,rgba(255,255,255,0.52)_100%)] px-4 py-3 text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur-[24px] backdrop-saturate-150 supports-[backdrop-filter]:bg-[linear-gradient(180deg,rgba(255,255,255,0.62)_0%,rgba(236,253,245,0.46)_100%)]"
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: 6, scale: 0.985 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: [0, -1, 0], scale: 1 }}
      transition={
        prefersReducedMotion
          ? undefined
          : {
              opacity: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
              y: { duration: 4.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" },
            }
      }
      aria-label={`${task.title}, ${task.subtitle}, ${safeProgress}% downloaded`}
      title={`${task.title} ${safeProgress}%`}
    >
      <FluentIconChip mode="download" />

      <div className="relative z-[1] min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-[15px] font-semibold tracking-[0] text-slate-900">
            {task.title}
          </span>
          <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-500">
            {safeProgress}%
          </span>
        </div>
        <div className="mt-0.5 truncate text-[12px] font-medium tracking-[0] text-slate-600">
          {task.subtitle}
        </div>
        <div className="mt-3">
          <FluentProgressRail mode="download" value={safeProgress} label="Download progress" />
        </div>
      </div>
    </motion.section>
  );
}
