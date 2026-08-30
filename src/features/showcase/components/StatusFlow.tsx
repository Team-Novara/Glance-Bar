import { HubShell } from "./HubShell";
import { showcaseSteps } from "@/providers/impl/mock/mockHubData";
import type { HubMode } from "@/entities";

type StatusFlowProps = {
  activeMode: HubMode;
};

const modeDetails: Record<HubMode, { label: string; caption: string }> = {
  idle: {
    label: "Idle baseline",
    caption: "Compact fallback when no showcase event is active.",
  },
  music: {
    label: "Mock music state",
    caption: "Fixture-backed media controls for the Hub preview.",
  },
  aiProgress: {
    label: "AI progress",
    caption: "Mock provider task progress rendered in the Hub shell.",
  },
  download: {
    label: "Download progress",
    caption: "Static file-transfer fallback with progress state.",
  },
  notification: {
    label: "Notification fixture",
    caption: "Mock message state, not a native Windows notification.",
  },
  multiTask: {
    label: "Stacked tasks",
    caption: "Multiple mock tasks composed in the same Hub surface.",
  },
};

export function StatusFlow({ activeMode }: StatusFlowProps) {
  const activeModeLabel = modeDetails[activeMode].label;

  return (
    <section className="space-y-5 font-['Segoe_UI','Microsoft_YaHei',system-ui,sans-serif]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">State inspection board</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            The active hub owns attention first. Other states stay visible as fallback surfaces and
            priority checks.
          </p>
        </div>
        <div className="border-white/12 max-w-full rounded-full border bg-white/[0.08] px-4 py-2 text-sm font-medium text-sky-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl">
          Focus: {activeModeLabel}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="grid gap-4 xl:grid-cols-2">
          {showcaseSteps.map((step) => {
            const selected = activeMode === step.mode;
            const details = modeDetails[step.mode];
            return (
              <div
                key={step.id}
                className={`group relative min-h-[176px] overflow-hidden rounded-[24px] border p-4 transition duration-200 ${
                  selected
                    ? "border-[#60cdff]/45 bg-[rgba(235,247,255,0.115)] shadow-[0_18px_50px_rgba(3,105,161,0.22),inset_0_1px_0_rgba(255,255,255,0.16)]"
                    : "hover:border-white/16 border-white/10 bg-[rgba(235,247,255,0.055)] shadow-[0_14px_34px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.11)] hover:bg-[rgba(235,247,255,0.085)]"
                } backdrop-blur-2xl`}
              >
                <div
                  className={`absolute left-0 top-5 h-8 w-[3px] rounded-r-full transition ${
                    selected ? "bg-[#60cdff]" : "group-hover:bg-white/24 bg-white/0"
                  }`}
                />
                <div className="mb-4 flex items-start justify-between gap-3 pl-2">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-white">{details.label}</div>
                    <div className="mt-1 text-sm text-slate-400">{details.caption}</div>
                  </div>
                  <span
                    className={`mt-1 shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      selected
                        ? "bg-[#60cdff]/18 text-[#a8e5ff]"
                        : "bg-white/[0.055] text-slate-400 group-hover:text-slate-300"
                    }`}
                  >
                    {selected ? "Current" : "Fallback"}
                  </span>
                </div>
                <div className="flex min-h-24 items-center justify-center rounded-[14px] border border-white/[0.07] bg-black/[0.08] px-3 py-4">
                  <HubShell mode={step.mode} />
                </div>
              </div>
            );
          })}
        </div>

        <aside className="rounded-[24px] border border-white/10 bg-[rgba(235,247,255,0.065)] p-4 shadow-[0_18px_46px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl">
          <div className="text-sm font-semibold text-white">Resolver notes</div>
          <div className="mt-1 text-xs leading-5 text-slate-400">
            Product-facing summary of how the current preview should be interpreted.
          </div>

          <div className="mt-4 space-y-3">
            <ResolverNote label="Current state" value={activeModeLabel} accent />
            <ResolverNote label="Entry path" value="Event bus -> scheduler -> hub shell" />
            <ResolverNote label="Source confidence" value="Mock / provider / fixture mixed" />
            <ResolverNote
              label="Desktop intent"
              value="Resident hub with temporary takeover states"
            />
          </div>

          <div className="mt-5 rounded-[18px] border border-white/10 bg-black/[0.12] p-3">
            <div className="text-xs font-semibold uppercase text-slate-400">
              Why this panel exists
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-200">
              The showcase should read like a desktop workbench: one active surface, clear fallback
              states, and explicit resolver reasoning instead of a gallery of equal-weight demos.
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function ResolverNote({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-[16px] border px-3 py-2.5 ${
        accent
          ? "border-sky-200/18 bg-sky-300/10 text-sky-50"
          : "border-white/10 bg-white/[0.05] text-slate-100"
      }`}
    >
      <div className="text-[11px] font-semibold uppercase text-slate-400">{label}</div>
      <div className="mt-1 text-[13px] font-semibold">{value}</div>
    </div>
  );
}
