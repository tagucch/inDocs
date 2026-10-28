export type PageSummary = {
  slug: string;
  title: string;
  project: string;
  projectLabel: string | null;
  source: string | null;
  size: number;
  createdAt: string;
  updatedAt: string;
  unread: boolean;
  starred: boolean;
  hidden: boolean;
};

export type ProjectState = {
  project: string;
  starred: boolean;
  pinned: boolean;
};

export type PagesResponse = {
  pages: PageSummary[];
  projects: ProjectState[];
  generatedAt: string;
};

export type PageStatePatch = { read?: boolean; starred?: boolean; hidden?: boolean };
export type ProjectStatePatch = { starred?: boolean; pinned?: boolean };

export type MeResponse = { email: string };

export type DeviceSummary = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type PairingResponse = { code: string; expiresAt: string };
export type PairClaimRequest = { code: string; deviceName: string };
export type PairClaimResponse = { token: string; deviceId: string; deviceName: string; email: string };

export type PutPageRequest = {
  html: string;
  title?: string;
  project?: string;
  projectLabel?: string;
  source?: string;
};

export type PutPageResponse = {
  slug: string;
  title: string;
  project: string;
  updatedAt: string;
  changed: boolean;
  url: string;
};

export type DevicePage = {
  slug: string;
  title: string;
  project: string;
  projectLabel: string | null;
  source: string | null;
  updatedAt: string;
  size: number;
};

export type TaskKind = "request" | "review";
export type TaskStatus = "waiting" | "answered" | "completed";

export type Task = {
  id: string;
  kind: TaskKind;
  sessionId: string | null;
  deviceId: string | null;
  deviceName: string | null;
  title: string | null;
  body: string;
  target: string | null;
  context: string | null;
  recommendation: string | null;
  status: TaskStatus;
  approved: boolean | null;
  responseText: string | null;
  createdAt: string;
  updatedAt: string;
  answeredAt: string | null;
  completedAt: string | null;
  expiresAt: string;
};

export type CreateRequestBody = { body: string; target?: string };
export type AnswerBody = { approved: boolean; responseText?: string };
export type PushReviewCard = { title: string; question: string; context?: string; recommendation?: string };
export type ApiError = { error: string; message?: string };
