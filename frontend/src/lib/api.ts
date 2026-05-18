/**
 * lib/api.ts
 * ----------
 * Typed HTTP client for communicating with the FastAPI backend.
 * Provides wrappers for authentication, notebooks, and filesystem operations.
 */
import { AuthResponse, KernelSpec, Notebook, NotebookSummary, UserProfile } from "../types";

const API_BASE = "http://localhost:8000";

/**
 * Extracts a human-readable error message from FastAPI HTTP 422/400 validation responses.
 */
function formatErrorDetail(detail: unknown): string {
  if (typeof detail === "string") {
    return detail;
  }

  // Handle FastAPI's array of Pydantic validation errors
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (!item || typeof item !== "object") {
          return String(item);
        }

        const validationError = item as { loc?: unknown[]; msg?: unknown };
        const location = Array.isArray(validationError.loc) ? validationError.loc.filter(Boolean).join(".") : "";
        const message = typeof validationError.msg === "string" ? validationError.msg : String(validationError.msg ?? "Invalid input");
        return location ? `${location}: ${message}` : message;
      })
      .join("; ");
  }

  // Handle generic nested detail objects
  if (detail && typeof detail === "object") {
    const payload = detail as { detail?: unknown; message?: unknown };
    return formatErrorDetail(payload.detail ?? payload.message);
  }

  return "Request failed";
}

/**
 * Core generic fetch wrapper that handles JSON headers, JWT injection, and error throwing.
 */
async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(formatErrorDetail(payload));
  }
  return response.json() as Promise<T>;
}

export const api = {
  baseUrl: API_BASE,
  
  // ── Auth ──────────────────────────────────────────────────────────────
  register(email: string, password: string, displayName: string) {
    return request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, display_name: displayName }),
    });
  },
  login(email: string, password: string) {
    return request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  me(token: string) {
    return request<UserProfile>("/api/auth/me", {}, token);
  },
  
  // ── Legacy Notebooks (Mostly unused now in favour of fs endpoints) ─────
  listNotebooks(token: string) {
    return request<NotebookSummary[]>("/api/notebooks", {}, token);
  },
  listKernels(token: string) {
    return request<KernelSpec[]>("/api/notebooks/kernels", {}, token);
  },
  createNotebook(token: string) {
    return request<Notebook>("/api/notebooks", {
      method: "POST",
      body: JSON.stringify({ title: "Untitled Notebook" }),
    }, token);
  },
  getNotebook(token: string, notebookId: string) {
    return request<Notebook>(`/api/notebooks/${notebookId}`, {}, token);
  },
  updateNotebook(token: string, notebookId: string, payload: Partial<Notebook>) {
    return request<Notebook>(
      `/api/notebooks/${notebookId}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
      token
    );
  },
  async upload(token: string, notebookId: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_BASE}/api/notebooks/${notebookId}/uploads`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(formatErrorDetail(payload) || "Upload failed");
    }
    return response.json();
  },
  
  // ── Filesystem (Current architecture) ─────────────────────────────────
  fs: {
    list(token: string) {
      return request<import("../types").FileNode>("/api/fs/list", {}, token);
    },
    async read(token: string, path: string) {
      const response = await fetch(`${API_BASE}/api/fs/read?path=${encodeURIComponent(path)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error("Failed to read file");
      }
      const contentType = response.headers.get("content-type") || "";
      
      // Images are returned as Blobs so they can be rendered via URL.createObjectURL
      if (
        contentType.includes("image/") ||
        /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(path)
      ) {
        return response.blob();
      }
      
      // Notebooks are parsed into standard JS objects
      if (path.endsWith(".cpynb")) {
        return response.json();
      }
      
      // Text files are wrapped in { content: "..." } by the backend
      const payload = await response.json().catch(() => null);
      if (payload && typeof payload.content === "string") return payload.content;
      
      // Fallback for empty/unknown
      return "";
    },
    write(token: string, path: string, content: string | object) {
      return request<{status: string}>("/api/fs/write", {
        method: "POST",
        // If content is an object (like a Notebook), stringify it first
        body: JSON.stringify({ path, content: typeof content === "string" ? content : JSON.stringify(content) })
      }, token);
    },
    rename(token: string, oldPath: string, newPath: string) {
      return request<{status: string}>("/api/fs/rename", {
        method: "POST",
        body: JSON.stringify({ old_path: oldPath, new_path: newPath })
      }, token);
    },
    delete(token: string, path: string) {
      return request<{status: string}>("/api/fs/delete", {
        method: "DELETE",
        body: JSON.stringify({ path })
      }, token);
    },
    async upload(token: string, path: string, file: File) {
      const formData = new FormData();
      formData.append("path", path);
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/api/fs/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      return response.json();
    }
  }
};
