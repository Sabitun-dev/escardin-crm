// What the Mini App API sends and receives (JSON). Shared by src/api.ts and webapp/.
import type { CheckKey } from "./rules/checks";
import type { JobStatus, Role } from "./rules/permissions";
import type { Task } from "./rules/today";

export type { Task, TaskKind, Tone } from "./rules/today";
export type AppLang = "uz" | "en";

export interface AppUser {
  id: number;
  name: string;
  role: Role;
  language: AppLang;
  is_active: boolean;
  is_reachable: boolean;
}

export interface AppCheck {
  key: CheckKey;
  value: string | null;
  note: string | null;
  promised_date: string | null;
  delivered_claimed: boolean;
  amount: number | null;
  updated_by: number | null;
  updated_by_name: string | null;
  updated_at: string | null;
}

export interface AppJob {
  id: number;
  name: string;
  install_date: string;
  price: number;
  status: JobStatus;
  seller_id: number;
  seller_name: string;
  tailor_id: number;
  tailor_name: string;
  closed_at: string | null;
  closed_by_name: string | null;
  closed_with_exception: boolean;
  exception_reason: string | null;
  checks: AppCheck[];
}

export interface AppEvent {
  id: number;
  type: string;
  check_key: CheckKey | null;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  created_at: string;
  user_name: string | null;
}

export interface AppPhoto {
  id: number;
  caption: string | null;
  created_at: string;
}

export interface MeResponse {
  user: AppUser;
  today: string;
}

export interface TodayResponse {
  today: string;
  tasks: Task[];
  jobs: AppJob[];
  week: { done: number; onTime: number };
}

export type JobFilter = "m" | "a" | "t" | "w" | "o" | "i" | "u" | "p";

export interface JobsResponse {
  items: AppJob[];
  total: number;
  page: number;
  pageSize: number;
}

/** A new install date suggested by the tailor, waiting for an admin */
export interface AppOffer {
  id: number;
  old_date: string;
  new_date: string;
  reason: string;
  proposed_by_name: string;
  created_at: string;
}

export interface JobDetailResponse {
  job: AppJob;
  photos: AppPhoto[];
  history: AppEvent[];
  offer: AppOffer | null;
}

export interface ReportItem {
  id: number;
  name: string;
  install_date: string;
  progress: number;
}

export type ReportSection = "attention" | "overdue" | "materials" | "problems" | "unpaid" | "noVideo" | "noLabel";

export interface ReportResponse {
  today: string;
  open: number;
  debt: number;
  sections: Record<ReportSection, ReportItem[]>;
}

export interface InviteResponse {
  code: string;
  name: string;
  role: Role;
  link: string;
}

/** Error body. `error` is a code the app translates (never shown raw). */
export interface ApiErrorBody {
  error: string;
  missing?: CheckKey[];
}
