/**
 * PeakCut Mobile TypeScript Data Models
 * Matches the FastAPI server models and schemas in `studio/`.
 */

export interface User {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  role: "admin" | "user";
  has_password: boolean;
  google: boolean;
  created_at: number;
  verified: boolean;
  photo: number;
}

export interface AuthResponse {
  user: User | null;
  token?: string;
}

export interface CreatorProfile {
  name?: string;
  avatar?: string;
  live?: boolean;
  title?: string;
  game?: string;
  at?: number;
  viewers?: number;
  platform?: string;
  channel?: string;
  embed?: string;
  pic?: string;
}

export interface Creator {
  id: string;
  name: string;
  channel?: string;
  channels?: Record<string, string>;
  auto_watch?: boolean;
  auto_post?: boolean;
  autopost?: boolean;
  live_job?: string | null;
  log?: string[];
  profile?: CreatorProfile;
  profiles?: Record<string, CreatorProfile>;
  created_at?: number;
  style?: string;
  layout?: string;
  min_score?: number;
  min_len?: number;
  max_len?: number;
  max_clips?: number;
  ai_only_on_spike?: boolean;
  plan?: string;
}

export interface ClipWord {
  word: string;
  start: number;
  end: number;
  score?: number;
}

export interface Clip {
  id: string;
  jid?: string;
  job_id?: string;
  title: string;
  hook?: string;
  score: number;
  layout?: string;
  start: number;
  end: number;
  duration?: number;
  video_url: string;
  text?: string;
  words?: ClipWord[];
  status?: string;
  created_at?: number;
  creator_name?: string;
  creatorName?: string;
}

export interface JobSource {
  url?: string;
  title?: string;
  creator?: string;
  channel?: string;
  platform?: string;
  duration?: number;
}

export interface JobAI {
  tokens: number;
  note: string;
  used: boolean;
}

export interface Job {
  id: string;
  status: "queued" | "working" | "done" | "error";
  stage?: string;
  created_at?: number;
  source?: JobSource;
  clips: Clip[];
  ai?: JobAI;
  creator?: string;
  uploader?: string;
}

export interface BillingPlan {
  id: string;
  name: string;
  price: number;
  days: number;
  clips_per_day: number;
  label: string;
  features?: string[];
}

export interface UsageStats {
  today_calls: number;
  total_calls: number;
  problem: string;
  breakdown?: Record<string, number>;
}

export interface ServerStatus {
  user: User;
  accounts: boolean;
  disk_full: boolean;
  no_ffmpeg: boolean;
  tour: boolean;
  youtube: boolean;
  styles: Record<string, string>;
  layouts: Record<string, string>;
}
