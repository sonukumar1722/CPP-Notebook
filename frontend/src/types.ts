export type CellType = "markdown" | "code";

export type CellStatus = "idle" | "queued" | "running" | "waiting-input" | "success" | "error";

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  bio?: string | null;
  avatar_url?: string | null;
  created_at: string;
}

export interface NotebookCell {
  id: string;
  cell_type: CellType;
  source: string;
  position: number;
}

export interface UploadedAsset {
  id: string;
  original_name: string;
  relative_path: string;
  content_type?: string | null;
  created_at: string;
}

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

export interface NotebookSummary {
  id: string;
  title: string;
  description?: string | null;
  autosave_enabled: boolean;
  kernel_name: string;
  updated_at: string;
}

export interface KernelSpec {
  name: string;
  display_name: string;
  language?: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: UserProfile;
}

export interface OutputItem {
  kind: "stream" | "error" | "result" | "display";
  stream?: string;
  text?: string;
  data?: Record<string, string>;
  traceback?: string[];
  ename?: string;
  evalue?: string;
}

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  children: FileNode[] | null;
}
