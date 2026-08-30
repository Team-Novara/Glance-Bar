import { motion, useReducedMotion } from "framer-motion";

import type { NotificationState } from "@/entities";

import { FluentIconChip } from "./ShowcaseFluentTokens";


type NotificationHubProps = {
  notification: NotificationState;
};

export function NotificationHub({ notification }: NotificationHubProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.section
      className="hub-card-sm relative flex min-w-[312px] items-center gap-3.5 overflow-hidden rounded-[9999px] bg-[linear-gradient(180deg,rgba(255,255,255,0.72)_0%,rgba(255,255,255,0.52)_100%)] px-4 py-3 text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur-[24px] backdrop-saturate-150 supports-[backdrop-filter]:bg-[linear-gradient(180deg,rgba(255,255,255,0.62)_0%,rgba(255,251,235,0.46)_100%)]"
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
              y: { duration: 4.8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" },
            }
      }
      aria-label={`${notification.app} notification from ${notification.sender}: ${notification.message}`}
    >
      <FluentIconChip mode="notification" />

      <div className="relative z-[1] min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold tracking-[0] text-slate-900">
          {notification.app}
        </div>
        <div className="mt-0.5 truncate text-[12px] font-medium leading-[1.25] text-slate-600">
          {notification.sender}: {notification.message}
        </div>
      </div>
    </motion.section>
  );
}
