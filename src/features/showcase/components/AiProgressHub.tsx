import { motion, useReducedMotion } from "framer-motion";
import { Bot } from "lucide-react";

import type { HubTask } from "@/entities";

type AiProgressHubProps = {
  task: HubTask;
};

export function AiProgressHub({ task }: AiProgressHubProps) {
  const prefersReducedMotion = useReducedMotion();
  const safeProgress = Number.isFinite(task.progress)
    ? Math.max(0, Math.min(task.progress ?? 0, 100))
    : 0;
  const isActive = safeProgress > 0 && safeProgress < 100;

  return (
    <motion.section
      className="hub-card-lg group relative flex min-w-[360px] items-center gap-3.5 overflow-hidden rounded-[9999px] bg-[linear-gradient(180deg,rgba(255,255,255,0.72)_0%,rgba(255,255,255,0.52)_100%)] px-4 py-3 text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur-[24px] backdrop-saturate-150 supports-[backdrop-filter]:bg-[linear-gradient(180deg,rgba(255,255,255,0.62)_0%,rgba(245,243,255,0.46)_100%)]"
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
              y: {
                duration: 4.2,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
              },
            }
      }
      aria-label={`${task.title}, ${task.subtitle}, ${safeProgress}% complete`}
      title={`${task.title} ${safeProgress}%`}
    >
      <motion.div
        className="relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/35 bg-[radial-gradient(circle_at_30%_28%,rgba(255,255,255,0.82),transparent_42%),linear-gradient(145deg,rgba(196,181,253,0.96)_0%,rgba(147,197,253,0.80)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_6px_16px_rgba(109,40,217,0.16)]"
        animate={
          !isActive || prefersReducedMotion
            ? undefined
            : {
                boxShadow: [
                  "inset 0 1px 0 rgba(255,255,255,0.65), 0 6px 16px rgba(109,40,217,0.16)",
                  "inset 0 1px 0 rgba(255,255,255,0.72), 0 8px 20px rgba(109,40,217,0.24)",
                  "inset 0 1px 0 rgba(255,255,255,0.65), 0 6px 16px rgba(109,40,217,0.16)",
                ],
              }
        }
        transition={
          !isActive || prefersReducedMotion
            ? undefined
            : {
                duration: 2.8,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
              }
        }
      >
        <div className="absolute inset-[7px] rounded-full bg-[radial-gradient(circle,rgba(109,40,217,0.22)_0%,rgba(109,40,217,0)_72%)] blur-[4px]" />
        <Bot
          aria-hidden="true"
          className="relative z-[1] h-[17px] w-[17px] text-violet-700 drop-shadow-[0_1px_2px_rgba(109,40,217,0.18)]"
          strokeWidth={2.2}
        />
      </motion.div>

      <div className="relative z-[1] min-w-0 flex-1">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold tracking-[0] text-slate-900">
              {task.title}
            </div>
            <motion.div
              className="mt-0.5 truncate text-[12px] font-medium tracking-[0] text-slate-600"
              animate={
                !isActive || prefersReducedMotion
                  ? undefined
                  : {
                      opacity: [0.72, 1, 0.72],
                    }
              }
              transition={
                !isActive || prefersReducedMotion
                  ? undefined
                  : {
                      duration: 1.8,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "easeInOut",
                    }
              }
            >
              {task.subtitle}
            </motion.div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div
            className="relative h-[5px] flex-1 overflow-hidden rounded-full bg-[linear-gradient(180deg,rgba(148,163,184,0.20),rgba(148,163,184,0.12))] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]"
            role="progressbar"
            aria-label={`AI task progress ${safeProgress}%`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={safeProgress}
          >
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#7c3aed_0%,#8b5cf6_52%,#c084fc_100%)] shadow-[0_0_10px_rgba(139,92,246,0.28)]"
              initial={prefersReducedMotion ? undefined : { width: 0 }}
              animate={{
                width: `${safeProgress}%`,
              }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.32,
                ease: [0.2, 0.8, 0.2, 1],
              }}
            />
            {!prefersReducedMotion && isActive ? (
              <motion.div
                className="absolute inset-y-0 w-12 rounded-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.34),transparent)] blur-[1px]"
                animate={{
                  x: ["-140%", "320%"],
                }}
                transition={{
                  duration: 2.2,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: "linear",
                }}
              />
            ) : null}
          </div>

          <div className="w-10 text-right text-[11px] font-medium tabular-nums tracking-[0] text-slate-500">
            {safeProgress}%
          </div>
        </div>
      </div>
    </motion.section>
  );
}
