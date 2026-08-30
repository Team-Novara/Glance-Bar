import {
  Bell,
  Bot,
  CircleStop,
  Download,
  Layers3,
  Music2,
  Play,
  Radio,
  Sparkles,
  Trash2,
} from "lucide-react";

import type { HubEvent, HubMode } from "@/entities";

type EventPlaygroundPanelProps = {
  activeEvents: HubEvent[];
  currentMode: HubMode;
  isAutoRunning: boolean;
  activeProviderLabel?: string;
  onMusic: () => void;
  onAi: () => void;
  onDownload: () => void;
  onNotification: () => void;
  onMultiTask: () => void;
  onClear: () => void;
  onStartDemo: () => void;
  onProviderMusic: () => void;
  onProviderAi: () => void;
  onProviderDownload: () => void;
  onProviderNotification: () => void;
  onProviderStop: () => void;
  onProviderClear: () => void;
  tauriFixtureLabel?: string;
  onTauriFixture: () => void;
};

type EventAction = {
  id: string;
  label: string;
  description: string;
  icon: typeof Music2;
  onClick: () => void;
  tone: "rose" | "sky" | "emerald" | "amber" | "violet" | "slate";
};

const modeLabel: Record<HubMode, string> = {
  idle: "Idle",
  music: "Music",
  aiProgress: "AI Progress",
  download: "Download",
  notification: "Notification",
  multiTask: "MultiTask",
};

const toneClass = {
  rose: "border-rose-200/16 bg-rose-300/10 text-rose-100 hover:bg-rose-300/14",
  sky: "border-sky-200/18 bg-sky-300/10 text-sky-100 hover:bg-sky-300/14",
  emerald: "border-emerald-200/18 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/14",
  amber: "border-amber-200/18 bg-amber-300/10 text-amber-100 hover:bg-amber-300/14",
  violet: "border-violet-200/18 bg-violet-300/10 text-violet-100 hover:bg-violet-300/14",
  slate: "border-white/10 bg-white/[0.07] text-slate-100 hover:bg-white/[0.105]",
};

const priorityLabel: Record<HubMode, string> = {
  idle: "None",
  music: "Music",
  aiProgress: "AI > Music",
  download: "Download",
  notification: "Notification > tasks",
  multiTask: "MultiTask",
};

const eventTypeLabel: Record<HubEvent["type"], string> = {
  music: "Music",
  ai: "AI task",
  download: "Download",
  notification: "Notification",
  media: "Media",
  clipboard: "Clipboard",
  focus: "Focus",
  system: "System",
};

const mockProviderSources = new Set<HubEvent["source"]>([
  "music",
  "download",
  "ai",
  "notification",
]);

export function EventPlaygroundPanel({
  activeEvents,
  currentMode,
  isAutoRunning,
  activeProviderLabel,
  onMusic,
  onAi,
  onDownload,
  onNotification,
  onMultiTask,
  onClear,
  onStartDemo,
  onProviderMusic,
  onProviderAi,
  onProviderDownload,
  onProviderNotification,
  onProviderStop,
  onProviderClear,
  tauriFixtureLabel,
  onTauriFixture,
}: EventPlaygroundPanelProps) {
  const actions: EventAction[] = [
    {
      id: "music",
      label: "Music",
      description: "Publish playback",
      icon: Music2,
      onClick: onMusic,
      tone: "rose",
    },
    {
      id: "ai",
      label: "AI",
      description: "Publish AI task",
      icon: Bot,
      onClick: onAi,
      tone: "sky",
    },
    {
      id: "download",
      label: "Download",
      description: "Publish transfer",
      icon: Download,
      onClick: onDownload,
      tone: "emerald",
    },
    {
      id: "notification",
      label: "Notification",
      description: "Priority event",
      icon: Bell,
      onClick: onNotification,
      tone: "amber",
    },
    {
      id: "multiTask",
      label: "MultiTask",
      description: "Publish bundle",
      icon: Layers3,
      onClick: onMultiTask,
      tone: "violet",
    },
    {
      id: "clear",
      label: "Clear / Idle",
      description: "Reset events",
      icon: CircleStop,
      onClick: onClear,
      tone: "slate",
    },
  ];

  return (
    <section className="font-['Segoe_UI','Microsoft_YaHei',system-ui,sans-serif]">
      <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(248,251,255,0.12),rgba(226,238,255,0.065))] shadow-[0_18px_52px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="bg-sky-300/12 grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-sky-200/20 text-sky-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
              <Radio size={18} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold leading-6 text-white">
                Diagnostics and replay
              </h2>
              <p className="truncate text-sm leading-5 text-slate-300">
                Inspect the current resolver path, replay known states, and compare provider versus
                fixture sources.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onStartDemo}
            disabled={isAutoRunning}
            className="bg-[#60cdff]/14 inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#60cdff]/30 px-4 text-sm font-semibold text-sky-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition hover:bg-[#60cdff]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAutoRunning ? <Sparkles size={16} /> : <Play size={16} />}
            {isAutoRunning ? "Replay running" : "Start replay"}
          </button>
        </div>

        <div className="grid gap-2 border-b border-white/10 px-4 py-3 text-xs leading-5 text-slate-300 md:grid-cols-3">
          <InsightCard
            title="State replay"
            description="Inject known event bundles to verify how the current hub surface resolves."
          />
          <InsightCard
            title="Source checks"
            description="Compare mock providers with the explicit Tauri fixture path before native wiring."
          />
          <InsightCard
            title="Resolver trace"
            description="Track active count, mode priority, and the source label shown in the event list."
          />
        </div>

        <div className="border-b border-white/10 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 min-w-[124px]">
              <div className="text-xs font-semibold uppercase tracking-normal text-slate-400">
                Source replay
              </div>
              <div className="truncate text-[12px] leading-4 text-slate-300">
                {activeProviderLabel ?? "Stopped, events stay"}
              </div>
            </div>
            <ProviderButton label="Music" icon={Music2} onClick={onProviderMusic} tone="rose" />
            <ProviderButton label="AI" icon={Bot} onClick={onProviderAi} tone="sky" />
            <ProviderButton
              label="Download"
              icon={Download}
              onClick={onProviderDownload}
              tone="emerald"
            />
            <ProviderButton
              label="Notify"
              icon={Bell}
              onClick={onProviderNotification}
              tone="amber"
            />
            <ProviderButton
              label="Tauri Fixture"
              icon={Sparkles}
              onClick={onTauriFixture}
              tone="violet"
            />
            <ProviderButton
              label="Stop source"
              icon={CircleStop}
              onClick={onProviderStop}
              tone="slate"
            />
            <ProviderButton
              label="Return to idle"
              icon={Trash2}
              onClick={onProviderClear}
              tone="slate"
            />
            <span
              className={`ml-auto rounded-full border px-2.5 py-1 text-xs font-semibold ${
                activeProviderLabel
                  ? "border-emerald-200/20 bg-emerald-300/10 text-emerald-100"
                  : "border-white/10 bg-white/[0.055] text-slate-300"
              }`}
            >
              {activeProviderLabel ? "Source active" : "Source idle"}
            </span>
            {tauriFixtureLabel && (
              <span className="rounded-full border border-violet-200/20 bg-violet-300/10 px-2.5 py-1 text-xs font-semibold text-violet-100">
                {tauriFixtureLabel}
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 min-[1500px]:grid-cols-3">
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={action.onClick}
                    className={`group flex min-h-[72px] items-center gap-3 rounded-[14px] border px-3 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${toneClass[action.tone]}`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-white/[0.075] text-current transition group-hover:bg-white/[0.11]">
                      <Icon size={18} strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold leading-5">
                        {action.label}
                      </span>
                      <span className="block truncate text-[12px] leading-4 text-slate-300/85">
                        {action.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-[16px] border border-white/10 bg-black/[0.12] px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">Resolver trace</span>
                <span className="rounded-full border border-white/10 bg-white/[0.075] px-2.5 py-1 text-xs font-medium text-sky-100">
                  Active: {activeEvents.length}
                </span>
              </div>
              <div className="grid gap-2 text-sm text-slate-200 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
                <FlowPill label="Active" value={`${activeEvents.length}`} />
                <FlowArrow />
                <FlowPill label="Priority" value={priorityLabel[currentMode]} />
                <FlowArrow />
                <FlowPill label="Mode" value={modeLabel[currentMode]} isActive />
              </div>
            </div>
          </div>

          <div className="rounded-[16px] border border-white/10 bg-[rgba(5,12,22,0.24)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Recent events</div>
                <div className="text-xs text-slate-400">Current mode: {modeLabel[currentMode]}</div>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  currentMode === "idle"
                    ? "bg-white/[0.07] text-slate-300"
                    : "bg-[#60cdff]/18 text-[#a8e5ff]"
                }`}
              >
                {modeLabel[currentMode]}
              </span>
            </div>

            {activeEvents.length === 0 ? (
              <div className="border-white/12 grid min-h-[132px] place-items-center rounded-[12px] border border-dashed bg-white/[0.035] px-4 text-center">
                <div>
                  <div className="text-sm font-semibold text-slate-100">No active replay input</div>
                  <div className="mt-1 text-xs leading-5 text-slate-400">
                    Trigger a state replay or start the automated sequence.
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-h-[236px] space-y-2 overflow-y-auto pr-1">
                {activeEvents.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function InsightCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[12px] border border-white/10 bg-white/[0.045] px-3 py-2">
      <div className="font-semibold text-slate-100">{title}</div>
      <p>{description}</p>
    </div>
  );
}

function FlowPill({
  label,
  value,
  isActive,
}: {
  label: string;
  value: string;
  isActive?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-[12px] border px-3 py-2 ${
        isActive
          ? "border-[#60cdff]/32 bg-[#60cdff]/13 text-sky-50"
          : "border-white/10 bg-white/[0.055] text-slate-200"
      }`}
    >
      <div className="text-[11px] font-medium uppercase tracking-normal text-slate-400">
        {label}
      </div>
      <div className="truncate text-[13px] font-semibold">{value}</div>
    </div>
  );
}

function ProviderButton({
  label,
  icon: Icon,
  onClick,
  tone,
}: {
  label: string;
  icon: typeof Music2;
  onClick: () => void;
  tone: EventAction["tone"];
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-2.5 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${toneClass[tone]}`}
    >
      <Icon size={14} strokeWidth={1.9} />
      {label}
    </button>
  );
}

function FlowArrow() {
  return <div className="hidden px-1 text-center text-slate-400 sm:block">-&gt;</div>;
}

function isTauriFixtureEvent(event: HubEvent) {
  return event.metadata?.runtime === "tauri" || event.metadata?.fixture === true;
}

function getEventSourceLabel(event: HubEvent) {
  if (isTauriFixtureEvent(event)) {
    return "Tauri fixture";
  }

  if (mockProviderSources.has(event.source)) {
    return "Mock provider";
  }

  if (event.source === "mock") {
    return "Mock scenario";
  }

  return "Fixture event";
}

function getEventDisplayText(event: HubEvent) {
  const payload = event.payload;

  if (payload && "title" in payload) {
    return {
      title: payload.title,
      subtitle: "subtitle" in payload ? (payload as { subtitle: string }).subtitle : "",
    };
  }

  if (payload && "sender" in payload) {
    return {
      title: payload.sender,
      subtitle: payload.message,
    };
  }

  return {
    title: event.type,
    subtitle: event.source,
  };
}

function EventRow({ event }: { event: HubEvent }) {
  const progress =
    typeof event.progress === "number" ? Math.max(0, Math.min(event.progress, 100)) : undefined;
  const display = getEventDisplayText(event);
  const sourceLabel = getEventSourceLabel(event);

  return (
    <div className="rounded-[12px] border border-white/10 bg-white/[0.055] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="whitespace-nowrap rounded-full bg-white/[0.075] px-2 py-0.5 text-[11px] font-semibold text-sky-100">
              {eventTypeLabel[event.type]}
            </span>
            <span className="whitespace-nowrap rounded-full border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[11px] font-semibold text-slate-300">
              {sourceLabel}
            </span>
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-white">{display.title}</div>
          <div className="truncate text-xs leading-5 text-slate-400">{display.subtitle}</div>
        </div>
        {typeof progress === "number" && (
          <span className="shrink-0 rounded-full bg-white/[0.075] px-2 py-0.5 text-[11px] font-semibold text-slate-200">
            {progress}%
          </span>
        )}
      </div>
      {typeof progress === "number" && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-500/25">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-300 to-blue-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
