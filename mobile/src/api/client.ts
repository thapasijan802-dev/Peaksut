/**
 * PeakCut Mobile API Client
 * Uses standard Bearer token authentication stored in `expo-secure-store`.
 */
import * as SecureStore from "expo-secure-store";
import { User, Creator, Job, Clip, UsageStats, ServerStatus } from "../types";

const TOKEN_KEY = "peakcut_session_token";
export const API_BASE = (process.env.EXPO_PUBLIC_API_URL || "https://peakcut.dpdns.org").replace(/\/+$/, "");

let _onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  _onUnauthorized = handler;
}

export async function getAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setAuthToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (err) {
    console.warn("Failed to save auth token to secure store", err);
  }
}

export async function clearAuthToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (err) {
    console.warn("Failed to clear auth token", err);
  }
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    Accept: "application/json",
    Origin: API_BASE,
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // 15-second AbortController timeout to prevent hanging on flaky networks
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (res.status === 401) {
      await clearAuthToken();
      if (_onUnauthorized) {
        _onUnauthorized();
      }
      throw new ApiError(401, "Please sign in.");
    }

    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const errJson = await res.json();
        message = errJson.detail || errJson.message || message;
      } catch {
        const text = await res.text();
        if (text) message = text.slice(0, 150);
      }
      throw new ApiError(res.status, message);
    }

    if (res.status === 204) {
      return {} as T;
    }

    return (await res.json()) as T;
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new ApiError(408, "Request timed out. Please check your internet connection.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  auth: {
    async login(email: string, password: string): Promise<{ user: User; token?: string }> {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Origin: API_BASE,
          },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
          signal: controller.signal,
        });

        if (!res.ok) {
          let msg = "Invalid email or password";
          try {
            const err = await res.json();
            msg = err.detail || msg;
          } catch {
            // fallback
          }
          throw new ApiError(res.status, msg);
        }

        const data = await res.json();
        const token = data.token;
        if (token) {
          await setAuthToken(token);
        }
        return { user: data.user, token };
      } catch (err: any) {
        if (err.name === "AbortError") {
          throw new ApiError(408, "Login request timed out.");
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
    },

    async signup(email: string, password: string, name = ""): Promise<{ user: User; token?: string }> {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const res = await fetch(`${API_BASE}/api/auth/signup`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Origin: API_BASE,
          },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password, name: name.trim() }),
          signal: controller.signal,
        });

        if (!res.ok) {
          let msg = "Failed to sign up";
          try {
            const err = await res.json();
            msg = err.detail || msg;
          } catch {
            // fallback
          }
          throw new ApiError(res.status, msg);
        }

        const data = await res.json();
        const token = data.token;
        if (token) {
          await setAuthToken(token);
        }
        return { user: data.user, token };
      } catch (err: any) {
        if (err.name === "AbortError") {
          throw new ApiError(408, "Signup request timed out.");
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
    },

    async getMe(): Promise<User | null> {
      try {
        const data = await request<{ user: User | null }>("/api/auth/me");
        return data.user;
      } catch {
        return null;
      }
    },

    async logout(): Promise<void> {
      try {
        await request("/api/auth/logout", { method: "POST" });
      } catch {
        // ignore network errors during sign out
      } finally {
        await clearAuthToken();
      }
    },

    async isAuthenticated(): Promise<boolean> {
      const token = await getAuthToken();
      if (!token) return false;
      const user = await this.getMe();
      return Boolean(user);
    },
  },

  creators: {
    async list(): Promise<Creator[]> {
      return await request<Creator[]>("/api/creators");
    },

    async update(cid: string, body: Partial<Creator>): Promise<Creator> {
      return await request<Creator>(`/api/creators/${encodeURIComponent(cid)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
    },

    async toggleAutoWatch(cid: string, autoWatch: boolean): Promise<Creator> {
      return await this.update(cid, { auto_watch: autoWatch });
    },
  },

  jobs: {
    async list(): Promise<Job[]> {
      return await request<Job[]>("/api/jobs");
    },

    async get(jid: string): Promise<Job> {
      return await request<Job>(`/api/jobs/${encodeURIComponent(jid)}`);
    },
  },

  clips: {
    async getRecent(): Promise<Clip[]> {
      const jobs = await api.jobs.list();
      const allClips: Clip[] = [];

      for (const job of jobs) {
        if (!job.clips || !Array.isArray(job.clips)) continue;
        for (const c of job.clips) {
          const videoName = c.id.endsWith(".mp4") ? c.id : `${c.id}.mp4`;
          allClips.push({
            ...c,
            jid: job.id,
            creator_name: job.source?.creator || "Streamer",
            video_url: `${API_BASE}/media/${encodeURIComponent(job.id)}/${encodeURIComponent(videoName)}`,
            created_at: job.created_at,
          });
        }
      }

      return allClips.sort((a, b) => (b.score || 0) - (a.score || 0));
    },

    getMediaUrl(jid: string, clipId: string): string {
      const name = clipId.endsWith(".mp4") ? clipId : `${clipId}.mp4`;
      return `${API_BASE}/media/${encodeURIComponent(jid)}/${encodeURIComponent(name)}`;
    },
  },

  usage: {
    async get(): Promise<UsageStats> {
      return await request<UsageStats>("/api/usage");
    },
  },

  status: {
    async get(): Promise<ServerStatus> {
      return await request<ServerStatus>("/api/status");
    },
  },
};
