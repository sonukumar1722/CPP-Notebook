/**
 * types.ts
 * --------
 * Global TypeScript interfaces and types for the CppNote frontend.
 */

// Cell types supported by the notebook (code execution or markdown rendering)
export type CellType = "markdown" | "code";

// Execution lifecycle states for a code cell
export type CellStatus = "idle" | "queued" | "running" | "waiting-input" | "success" | "error";

// User profile data returned by the auth endpoints
export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  bio?: string | null;
  avatar_url?: string | null;
  created_at: string;
}

// Represents a single block in a notebook
export interface NotebookCell {
  id: string;
  cell_type: CellType;
  source: string;
  position: number;
}

// Deprecated/Legacy interface for uploaded assets attached to a database notebook
export interface UploadedAsset {
  id: string;
  original_name: string;
  relative_path: string;
  content_type?: string | null;
  created_at: string;
}

// Standard structure for a `.cpynb` JSON notebook document
export interface Notebook {
  id: string;
  title: string;
  description?: string | null;
  autosave_enabled: boolean;
  kernel_name: string;
  updated_at: string;
  cells: NotebookCell[];
  uploads: UploadedAsset[];
}

// Lightweight notebook summary
export interface NotebookSummary {
  id: string;
  title: string;
  description?: string | null;
  autosave_enabled: boolean;
  kernel_name: string;
  updated_at: string;
}

// Jupyter kernel specification details
export interface KernelSpec {
  name: string;
  display_name: string;
  language?: string | null;
}

// Response from the /api/auth/login and /register endpoints
export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: UserProfile;
}

// Polymorphic structure representing a single output message from the Jupyter kernel
export interface OutputItem {
  kind: "stream" | "error" | "result" | "display";
  stream?: string; // "stdout" | "stderr"
  text?: string;
  data?: Record<string, string>; // Mime-type mapped to base64 or string content
  traceback?: string[];
  ename?: string;
  evalue?: string;
}

// A node in the workspace file tree
export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  children: FileNode[] | null;
}
