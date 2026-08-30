import { createSystemPerformanceMetricSnapshot } from '@/entities/status/config';
import type { SystemPerformanceMetric } from '@/entities/status/performance';
import type {
  HubTask,
  MusicState,
  NotificationState,
  ShowcaseStep,
} from '@/entities/status/types';

export const systemPerformanceMetrics: SystemPerformanceMetric[] =
  createSystemPerformanceMetricSnapshot({
    cpu: 23,
    memory: 68,
    downloadSpeed: 2_457_600,
    uploadSpeed: 512_000,
  });

export const musicState: MusicState = {
  title: "Starline OST",
  subtitle: "Hope Is the Thing",
  time: "02:35 / 04:32",
  progress: 56,
};

export const aiTask: HubTask = {
  id: "ai-gpt",
  type: "ai",
  title: "GPT-5.5",
  subtitle: "Generating code...",
  progress: 68,
  accent: "blue",
};

export const downloadTask: HubTask = {
  id: "download-ubuntu",
  type: "download",
  title: "Ubuntu.iso",
  subtitle: "2.3GB / 4.8GB",
  progress: 48,
  accent: "green",
};

export const notificationState: NotificationState = {
  app: "Teams",
  sender: "Alex",
  message: "CS2 tonight?",
};

export const multiTasks: HubTask[] = [
  {
    id: "music-ost",
    type: "music",
    title: musicState.title,
    subtitle: musicState.time,
    progress: musicState.progress,
    accent: "pink",
  },
  aiTask,
  downloadTask,
];

export const showcaseSteps: ShowcaseStep[] = [
  { id: "idle", mode: "idle", label: "1. Idle state", caption: "Collapsed" },
  { id: "music", mode: "music", label: "2. Music playback", caption: "Media controls" },
  { id: "ai", mode: "aiProgress", label: "3. AI task running", caption: "Progress feedback" },
  { id: "download", mode: "download", label: "4. Download running", caption: "File progress" },
  {
    id: "notification",
    mode: "notification",
    label: "5. Message received",
    caption: "Auto collapse after 3s",
  },
  { id: "multi", mode: "multiTask", label: "6. Multi-task stack", caption: "Expanded" },
];
