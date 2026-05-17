import React, { FormEvent, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { api } from "./lib/api";
import { AuthResponse, CellStatus, KernelSpec, Notebook, NotebookCell, OutputItem, UserProfile, FileNode } from "./types";
import { Navbar } from "./components/Navbar";
import { Sidebar } from "./components/Sidebar";
import { FileViewer } from "./components/FileViewer";
import { Cell } from "./components/Cell";
import { ProfileModal } from "./components/ProfileModal";

const WS_BASE = "ws://localhost:8000";
const LAST_PATH_KEY = "cppnote-last-path";
const TEXT_AUTOSAVE_KEY = "cppnote-text-autosave";

function uid() {
  return crypto.randomUUID();
}

function sortCells(cells: NotebookCell[]) {
  return [...cells].sort((a, b) => a.position - b.position);
}

function normalizedCells(cells: NotebookCell[]): NotebookCell[] {
  return sortCells(cells).map((cell, index) => ({ ...cell, position: index }));
}

function textFromFileRead(data: unknown): string {
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && typeof (data as { content?: unknown }).content === "string") {
    return (data as { content: string }).content;
  }
  return "";
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("cppnote-token"));
  const [user, setUser] = useState<UserProfile | null>(null);

  // File System State
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Editor State
  const [activeNotebook, setActiveNotebook] = useState<Notebook | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [textAutosaveEnabled, setTextAutosaveEnabled] = useState(() => {
    const saved = localStorage.getItem(TEXT_AUTOSAVE_KEY);
    return saved === null ? true : saved === "true";
  });

  // App Config
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [kernels, setKernels] = useState<KernelSpec[]>([]);

  // Notebook Execution State
  const [outputs, setOutputs] = useState<Record<string, OutputItem[]>>({});
  const [statuses, setStatuses] = useState<Record<string, CellStatus>>({});
  const [prompts, setPrompts] = useState<Record<string, { prompt: string; value: string }>>({});
  // executionOrder tracks the global run-order counter per cell (increases each time any cell is run)
  const [executionOrder, setExecutionOrder] = useState<Record<string, number>>({});
  const executionCounterRef = useRef(0); // monotonically increasing
  const [kernelStatus, setKernelStatus] = useState<"idle" | "busy" | "connecting" | "error">("idle");
  const [runningAll, setRunningAll] = useState(false);
  // track which cells are still pending in run-all
  const pendingCellsRef = useRef<Set<string>>(new Set());

  // Auth State
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Modals & Dialogs
  const [showProfile, setShowProfile] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; placeholder: string; onConfirm: (v: string) => void } | null>(null);
  const [dialogValue, setDialogValue] = useState("");
  const dialogInputRef = useRef<HTMLInputElement>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const tokenRef = useRef<string | null>(token);
  const activePathRef = useRef<string | null>(activePath);
  const activeNotebookRef = useRef<Notebook | null>(activeNotebook);
  const textContentRef = useRef<string | null>(textContent);

  const activeCells = useMemo(() => sortCells(activeNotebook?.cells ?? []), [activeNotebook]);
  const activeAutosaveEnabled = activePath?.endsWith(".cpynb")
    ? activeNotebook?.autosave_enabled ?? false
    : textAutosaveEnabled;

  const openDialog = (title: string, placeholder: string, onConfirm: (v: string) => void) => {
    setDialogValue("");
    setDialog({ title, placeholder, onConfirm });
    setTimeout(() => dialogInputRef.current?.focus(), 50);
  };

  const confirmDialog = () => {
    if (!dialogValue.trim() || !dialog) return;
    dialog.onConfirm(dialogValue.trim());
    setDialog(null);
  };

  const logout = useCallback(() => {
    localStorage.removeItem("cppnote-token");
    localStorage.removeItem(LAST_PATH_KEY);
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);

  useEffect(() => {
    activeNotebookRef.current = activeNotebook;
  }, [activeNotebook]);

  useEffect(() => {
    textContentRef.current = textContent;
  }, [textContent]);

  useEffect(() => {
    if (!token) {
      setIsInitializing(false);
      return;
    }
    api.me(token).then((userProfile) => {
      setUser(userProfile);
      setIsInitializing(false);
      // Restore last open file after login
      const lastPath = localStorage.getItem(LAST_PATH_KEY);
      if (lastPath) {
        setActivePath(lastPath);
        setOpenTabs([lastPath]);
      }
    }).catch(() => {
      localStorage.removeItem("cppnote-token");
      localStorage.removeItem(LAST_PATH_KEY);
      setToken(null);
      setIsInitializing(false);
    });
  }, [token]);

  const loadFileTree = useCallback(async () => {
    if (!token) return;
    try {
      const tree = await api.fs.list(token);
      setFileTree(tree);
    } catch (e) {
      console.error(e);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    loadFileTree();
    api.listKernels(token).then(setKernels).catch(console.error);
  }, [token, loadFileTree]);

  // Persist active path to localStorage
  const handleSetActivePath = useCallback((path: string | null) => {
    setActivePath(path);
    if (path) {
      localStorage.setItem(LAST_PATH_KEY, path);
      setOpenTabs(prev => prev.includes(path) ? prev : [...prev, path]);
    } else {
      localStorage.removeItem(LAST_PATH_KEY);
    }
  }, []);

  const closeTab = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    setOpenTabs(prev => {
      const next = prev.filter(p => p !== path);
      if (activePath === path) {
        handleSetActivePath(next.length > 0 ? next[next.length - 1] : null);
      }
      return next;
    });
  };

  // Load selected file
  useEffect(() => {
    if (!token || !activePath) return;

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    setActiveNotebook(null);
    activeNotebookRef.current = null;
    setTextContent(null);
    textContentRef.current = null;
    setImageUrl(null);
    setOutputs({});
    setStatuses({});
    setPrompts({});
    setExecutionOrder({});
    executionCounterRef.current = 0;
    setIsDirty(false);
    socketRef.current?.close();
    setKernelStatus("idle");

    const ext = activePath.split('.').pop()?.toLowerCase();

    let objectUrl: string | null = null;

    if (ext === "cpynb") {
      api.fs.read(token, activePath).then((data) => {
        const notebook = typeof data === "string" ? JSON.parse(data) : data as Notebook;
        activeNotebookRef.current = notebook;
        setActiveNotebook(notebook);
      }).catch(console.error);
    } else if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext || "")) {
      api.fs.read(token, activePath).then((blob) => {
        if (blob instanceof Blob) {
          objectUrl = URL.createObjectURL(blob);
          setImageUrl(objectUrl);
        }
      }).catch(console.error);
    } else {
      api.fs.read(token, activePath).then((data) => {
        const content = textFromFileRead(data);
        textContentRef.current = content;
        setTextContent(content);
      }).catch(console.error);
    }

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token, activePath]);

  // WebSocket for notebooks
  useEffect(() => {
    if (!token || !activePath || !activePath.endsWith(".cpynb")) return;

    setKernelStatus("connecting");
    const socket = new WebSocket(`${WS_BASE}/ws/notebooks/${activePath}?token=${token}`);
    socketRef.current = socket;

    socket.onopen = () => setKernelStatus("idle");
    socket.onerror = () => setKernelStatus("error");
    socket.onclose = () => setKernelStatus("error");

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const cellId = message.cellId as string | undefined;

      if (message.type === "cell.queued" && cellId) {
        setStatuses((state) => ({ ...state, [cellId]: "queued" }));
      }
      if (message.type === "cell.running" && cellId) {
        setStatuses((state) => ({ ...state, [cellId]: "running" }));
        // Assign execution order when cell actually starts running
        executionCounterRef.current += 1;
        const count = executionCounterRef.current;
        setExecutionOrder((state) => ({ ...state, [cellId]: count }));
      }
      if (message.type === "cell.stream" && cellId) {
        setOutputs((state) => ({
          ...state,
          [cellId]: [...(state[cellId] ?? []), { kind: "stream", stream: message.stream, text: message.text }],
        }));
      }
      if (message.type === "cell.result" && cellId) {
        setOutputs((state) => ({
          ...state,
          [cellId]: [...(state[cellId] ?? []), { kind: "result", data: message.data }],
        }));
        setStatuses((state) => ({ ...state, [cellId]: "success" }));
      }
      if (message.type === "cell.display" && cellId) {
        setOutputs((state) => ({
          ...state,
          [cellId]: [...(state[cellId] ?? []), { kind: "display", data: message.data }],
        }));
      }
      if (message.type === "cell.error" && cellId) {
        setOutputs((state) => ({
          ...state,
          [cellId]: [
            ...(state[cellId] ?? []),
            {
              kind: "error",
              ename: message.ename,
              evalue: message.evalue,
              traceback: message.traceback,
            },
          ],
        }));
        setStatuses((state) => ({ ...state, [cellId]: "error" }));
        if (pendingCellsRef.current.has(cellId)) {
          pendingCellsRef.current.delete(cellId);
        }
      }
      if (message.type === "cell.clear" && cellId) {
        setOutputs((state) => ({ ...state, [cellId]: [] }));
      }
      if (message.type === "cell.input_request" && cellId) {
        setStatuses((state) => ({ ...state, [cellId]: "waiting-input" }));
        setPrompts((state) => ({ ...state, [cellId]: { prompt: message.prompt ?? "", value: "" } }));
      }
      if (message.type === "kernel.status") {
        setKernelStatus(message.state);
        if (message.state === "idle") {
          if (cellId) {
            setStatuses((state) => {
              const cur = state[cellId];
              // Only "running" or "waiting-input" → "success".
              // If cur is "queued" the idle event belongs to the PREVIOUS
              // (interrupted) execution — leave the new execution alone.
              if (cur === "running" || cur === "waiting-input") {
                return { ...state, [cellId]: "success" };
              }
              return state;
            });
            setPrompts((state) => {
              if (!state[cellId]) return state;
              const next = { ...state };
              delete next[cellId];
              return next;
            });
            // Only remove from pending if the cell actually finished (not if it
            // was queued — that means it hasn't started yet).
            pendingCellsRef.current.delete(cellId);
          }
          if (pendingCellsRef.current.size === 0) {
            setRunningAll(false);
          }
        }
      }
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [token, activePath]);

  const saveFile = useCallback(async () => {
    const currentToken = tokenRef.current;
    const currentPath = activePathRef.current;
    if (!currentToken || !currentPath) return;

    const currentNotebook = activeNotebookRef.current;
    const currentTextContent = textContentRef.current;

    try {
      if (currentNotebook && currentPath.endsWith(".cpynb")) {
        await api.fs.write(currentToken, currentPath, {
          ...currentNotebook,
          cells: normalizedCells(currentNotebook.cells)
        });
      } else if (currentTextContent !== null) {
        await api.fs.write(currentToken, currentPath, currentTextContent);
      } else {
        return; // nothing to save
      }
      setIsDirty(false);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const toggleAutosave = useCallback(() => {
    if (activePath?.endsWith(".cpynb")) {
      if (!activeNotebook || !token) return;

      const nextNotebook = {
        ...activeNotebook,
        autosave_enabled: !activeNotebook.autosave_enabled,
      };

      setActiveNotebook(nextNotebook);
      setIsDirty(true);

      api.fs.write(token, activePath, {
        ...nextNotebook,
        cells: normalizedCells(nextNotebook.cells)
      }).then(() => {
        setIsDirty(false);
      }).catch(console.error);
      return;
    }

    setTextAutosaveEnabled((enabled) => {
      const next = !enabled;
      localStorage.setItem(TEXT_AUTOSAVE_KEY, String(next));
      return next;
    });
  }, [activeNotebook, activePath, token]);

  // Auto-save notebook
  useEffect(() => {
    if (!token || !activeNotebook || !activePath || !isDirty) return;
    if (!activeNotebook.autosave_enabled) return;

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    saveTimerRef.current = window.setTimeout(() => {
      saveFile();
    }, 1500);
  }, [activeNotebook, token, activePath, isDirty, saveFile]);

  // Auto-save text file
  useEffect(() => {
    if (!token || typeof textContent !== "string" || !activePath || !isDirty) return;
    if (activePath.endsWith(".cpynb")) return;
    if (!textAutosaveEnabled) return;

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    saveTimerRef.current = window.setTimeout(() => {
      saveFile();
    }, 1500);
  }, [textContent, token, activePath, isDirty, saveFile, textAutosaveEnabled]);

  const authenticate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError(null);
    const form = new FormData(event.currentTarget);

    // Register-specific validation
    if (authMode === "register") {
      const password = String(form.get("password"));
      const confirm = String(form.get("confirmPassword"));
      if (password.length < 6) {
        setAuthError("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirm) {
        setAuthError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);
    try {
      const response: AuthResponse =
        authMode === "login"
          ? await api.login(String(form.get("email")), String(form.get("password")))
          : await api.register(
              String(form.get("email")),
              String(form.get("password")),
              String(form.get("displayName"))
            );
      localStorage.setItem("cppnote-token", response.access_token);
      setToken(response.access_token);
      setUser(response.user);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const updateNotebook = (updater: (current: Notebook) => Notebook) => {
    setIsDirty(true);
    setActiveNotebook((current) => {
      if (!current) return current;
      const next = updater(current);
      activeNotebookRef.current = next;
      return next;
    });
  };

  const addCell = (index: number, cellType: "markdown" | "code") => {
    updateNotebook((current) => {
      const next = [...sortCells(current.cells)];
      next.splice(index, 0, {
        id: uid(),
        cell_type: cellType,
        source: cellType === "markdown" ? "New markdown cell" : "",
        position: index,
      });
      return { ...current, cells: normalizedCells(next) };
    });
  };

  const deleteCell = (cellId: string) => {
    updateNotebook((current) => ({
      ...current,
      cells: normalizedCells(current.cells.filter((cell) => cell.id !== cellId)),
    }));
  };

  // FIX: swap positions directly without normalizing in between
  const moveCell = (cellId: string, direction: -1 | 1) => {
    updateNotebook((current) => {
      const sorted = sortCells(current.cells);
      const index = sorted.findIndex((cell) => cell.id === cellId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= sorted.length) return current;
      // Swap positions
      const posA = sorted[index].position;
      const posB = sorted[target].position;
      const updated = sorted.map((cell) => {
        if (cell.id === sorted[index].id) return { ...cell, position: posB };
        if (cell.id === sorted[target].id) return { ...cell, position: posA };
        return cell;
      });
      return { ...current, cells: normalizedCells(updated) };
    });
  };

  const runCell = useCallback((cell: NotebookCell) => {
    setOutputs((state) => ({ ...state, [cell.id]: [] }));
    setStatuses((state) => ({ ...state, [cell.id]: "queued" }));
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setStatuses((state) => ({ ...state, [cell.id]: "error" }));
      setOutputs((state) => ({
        ...state,
        [cell.id]: [{
          kind: "error",
          ename: "Kernel connection",
          evalue: socket?.readyState === WebSocket.CONNECTING
            ? "Kernel is still connecting. Try running the cell again in a moment."
            : "Kernel is not connected. Reconnect the kernel and run the cell again.",
        }],
      }));
      return;
    }
    socket.send(
      JSON.stringify({
        type: "execute",
        cellId: cell.id,
        source: cell.source,
      })
    );
  }, []);

  const stopCell = useCallback((cellId?: string) => {
    const sock = socketRef.current;
    if (sock?.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify({ type: "interrupt" }));
      // Send an empty stdin reply so xeus-cling's stdin pump unblocks
      // cleanly after being interrupted while waiting for user input.
      sock.send(JSON.stringify({ type: "input_reply", value: "" }));
    }
    if (cellId) {
      setStatuses((state) => ({ ...state, [cellId]: "idle" }));
      setPrompts((state) => {
        if (!state[cellId]) return state;
        const next = { ...state };
        delete next[cellId];
        return next;
      });
      // Clear the output panel immediately so the cell looks clean
      setOutputs((state) => ({ ...state, [cellId]: [] }));
    }
  }, []);

  const runAll = () => {
    const codeCells = activeCells.filter((cell) => cell.cell_type === "code");
    pendingCellsRef.current = new Set(codeCells.map((c) => c.id));
    setRunningAll(true);
    codeCells.forEach(runCell);
  };

  const stopAll = () => {
    const sock = socketRef.current;
    if (sock?.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify({ type: "interrupt" }));
      // Unblock any xeus-cling stdin pump waiting for user input
      sock.send(JSON.stringify({ type: "input_reply", value: "" }));
    }
    pendingCellsRef.current.clear();
    setRunningAll(false);
    setStatuses((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        if (next[id] === "running" || next[id] === "queued" || next[id] === "waiting-input") {
          next[id] = "idle";
        }
      });
      return next;
    });
    setPrompts({});
    // Clear all outputs so every cell's output panel collapses
    setOutputs({});
  };

  const clearOutputs = () => {
    setOutputs({});
  };

  const clearCellOutputs = (cellId: string) => {
    setOutputs((state) => ({ ...state, [cellId]: [] }));
  };

  const submitInput = (cellId: string, value: string) => {
    socketRef.current?.send(JSON.stringify({ type: "input_reply", value }));
    // Clear the prompt immediately so the UI stops showing the input box.
    // The kernel will send a cell.running / kernel.status message to update status.
    setPrompts((state) => {
      const next = { ...state };
      delete next[cellId];
      return next;
    });
    setStatuses((state) => ({ ...state, [cellId]: "running" }));
  };

  const handleCreateFile = async (dirPath: string, name: string) => {
    if (!token) return;
    const newPath = dirPath === "" ? name : `${dirPath}/${name}`;
    let content = "";
    if (name.endsWith(".cpynb")) {
      content = JSON.stringify({
        id: uid(),
        title: name.replace(".cpynb", ""),
        autosave_enabled: true,
        kernel_name: "xcpp17",
        updated_at: new Date().toISOString(),
        cells: [
          { id: uid(), cell_type: "markdown", source: "# New Notebook", position: 0 },
          { id: uid(), cell_type: "code", source: '#include <iostream>\n\nstd::cout << "Hello World!";', position: 1 }
        ],
        uploads: []
      });
    }
    await api.fs.write(token, newPath, content);
    await loadFileTree();
    handleSetActivePath(newPath);
  };

  const handleCreateFolder = async (dirPath: string, name: string) => {
    if (!token) return;
    const newPath = dirPath === "" ? `${name}/.keep` : `${dirPath}/${name}/.keep`;
    await api.fs.write(token, newPath, "");
    await loadFileTree();
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!token) return;
    // Upload to current directory or root
    const parentDir = activePath
      ? (activePath.includes("/") ? activePath.substring(0, activePath.lastIndexOf("/")) : "")
      : "";

    for (const file of acceptedFiles) {
      try {
        await api.fs.upload(token, parentDir, file);
      } catch (e) {
        console.error("Upload error:", e);
      }
    }
    // Always refresh tree after uploads
    await loadFileTree();
  }, [token, activePath, loadFileTree]);

  const { getRootProps, getInputProps, isDragActive, open: openDropzone } = useDropzone({ onDrop, noClick: true });

  // Upload button handler — works even without active file
  const handleUpload = useCallback(() => {
    openDropzone();
  }, [openDropzone]);

  // Ctrl+S / Cmd+S save shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveFile();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveFile]);

  // Shared background structure for auth pages
  const AuthBackground = () => (
    <div className="auth-bg-blobs">
      <div className="auth-blob auth-blob-1" />
      <div className="auth-blob auth-blob-2" />
      <div className="auth-blob auth-blob-3" />
    </div>
  );

  // C++ Notebook icon badge
  const AuthIcon = () => (
    <div className="auth-logo-wrap">
      <div className="auth-logo-badge">
        <div className="auth-logo-icon">
          <div className="auth-logo-rings">
            <div className="auth-logo-ring" />
            <div className="auth-logo-ring" />
            <div className="auth-logo-ring" />
          </div>
          <div className="auth-logo-page" />
          <span className="auth-logo-text">C++</span>
        </div>
      </div>
    </div>
  );

  if (isInitializing) {
    return (
      <div className="auth-shell">
        <AuthBackground />
        <div className="auth-card" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '180px' }}>
          <AuthIcon />
          <div className="auth-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
        </div>
      </div>
    );
  }

  if (!token || !user) {
    const isLogin = authMode === "login";
    return (
      <div className="auth-shell">
        <AuthBackground />
        <div className="auth-card">
          <AuthIcon />
          <h1 className="auth-title">{isLogin ? "C++ Notebook Editor" : "Create Account"}</h1>
          <p className="auth-subtitle">
            {isLogin
              ? "Sign in to access your projects and manage your notebook sessions."
              : "Join CPPNote to manage your C++ notebooks and projects."}
          </p>

          <form onSubmit={authenticate} className="auth-form">
            {/* Register: Display Name */}
            {!isLogin && (
              <div className="auth-field-wrap">
                <span className="auth-field-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                </span>
                <input className="auth-input no-right-pad" name="displayName" placeholder="Display Name" minLength={2} required />
              </div>
            )}

            {/* Email */}
            <div className="auth-field-wrap">
              <span className="auth-field-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              </span>
              <input className="auth-input no-right-pad" name="email" type="email" placeholder="Email Address" required />
            </div>

            {/* Password */}
            <div className="auth-field-wrap">
              <span className="auth-field-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </span>
              <input
                className="auth-input"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                minLength={isLogin ? 1 : 6}
                required
              />
              <button type="button" className="auth-field-eye" onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
                {showPassword
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>

            {/* Register: Confirm Password */}
            {!isLogin && (
              <div className="auth-field-wrap">
                <span className="auth-field-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </span>
                <input
                  className="auth-input"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm Password"
                  minLength={6}
                  required
                />
                <button type="button" className="auth-field-eye" onClick={() => setShowConfirmPassword(v => !v)} tabIndex={-1}>
                  {showConfirmPassword
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            )}

            {/* Login extras */}
            {isLogin && (
              <>
                <div className="auth-forgot-row">
                  <button type="button" className="auth-forgot">Forgot Password?</button>
                </div>
              </>
            )}

            {/* Error banner */}
            {authError && (
              <div className="auth-error">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {authError}
              </div>
            )}

            {/* Submit */}
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? <div className="auth-spinner" /> : (isLogin ? "Sign In" : "Create Account")}
            </button>

            {/* Remember Me (login only) */}
            {isLogin && (
              <label className="auth-remember">
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                Remember me
              </label>
            )}
          </form>

          {/* Bottom switch link */}
          <div className="auth-bottom-row">
            {isLogin ? "Don't have an account?" : "Already have an account?"}
            <button type="button" className="auth-switch-btn" onClick={() => { setAuthMode(isLogin ? "register" : "login"); setAuthError(null); }}>
              {isLogin ? "Register" : "Sign In"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell" {...getRootProps()}>
      {dialog && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ margin: '0 0 1rem' }}>{dialog.title}</h3>
            <input
              ref={dialogInputRef}
              value={dialogValue}
              onChange={e => setDialogValue(e.target.value)}
              placeholder={dialog.placeholder}
              onKeyDown={e => { if (e.key === 'Enter') confirmDialog(); if (e.key === 'Escape') setDialog(null); }}
              style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setDialog(null)}>Cancel</button>
              <button className="primary" onClick={confirmDialog}>Create</button>
            </div>
          </div>
        </div>
      )}

      {showProfile && (
        <ProfileModal
          user={user}
          token={token}
          onClose={() => setShowProfile(false)}
          onLogout={logout}
          onSave={async (name, bio, avatarUrl) => {
            setUser({ ...user, display_name: name, bio, avatar_url: avatarUrl ?? user.avatar_url });
          }}
        />
      )}

      <input {...getInputProps()} />
      {isDragActive && (
        <div className="dropzone-overlay">
          Drop files to upload
        </div>
      )}

      <Navbar
        user={user}
        activePath={activePath}
        theme={theme}
        isDirty={isDirty}
        isSaved={!isDirty}
        autosaveEnabled={activeAutosaveEnabled}
        kernels={kernels}
        selectedKernel={activeNotebook?.kernel_name ?? "xcpp17"}
        kernelStatus={kernelStatus}
        runningAll={runningAll}
        onThemeToggle={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
        onSave={saveFile}
        onAutosaveToggle={toggleAutosave}
        onRunAll={runAll}
        onStopAll={stopAll}
        onClearOutputs={clearOutputs}
        onRestartKernel={() => socketRef.current?.send(JSON.stringify({ type: "restart" }))}
        onKernelSelect={(kernel) => updateNotebook(c => ({ ...c, kernel_name: kernel }))}
        onOpenProfile={() => setShowProfile(true)}
        onLogout={logout}
        onConnect={() => socketRef.current?.send(JSON.stringify({ type: "restart" }))}
      />

      <div className="main-container">
        <Sidebar
          user={user}
          fileTree={fileTree}
          activePath={activePath}
          dirtyPath={isDirty ? activePath : null}
          collapsed={isSidebarCollapsed}
          baseUrl={api.baseUrl}
          token={token}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onSelect={handleSetActivePath}
          onRename={async (oldP, newP) => {
            await api.fs.rename(token, oldP, newP);
            if (activePath === oldP) handleSetActivePath(newP);
            loadFileTree();
          }}
          onDelete={async (path) => {
            await api.fs.delete(token, path);
            if (activePath === path) handleSetActivePath(null);
            loadFileTree();
          }}
          onNewFile={handleCreateFile}
          onNewFolder={handleCreateFolder}
          onUpload={handleUpload}
        />

        <div className="working-area">
          {openTabs.length > 0 && (
            <div className="workarea-tabs">
              {openTabs.map(tabPath => (
                <div
                  key={tabPath}
                  className={`workarea-tab ${activePath === tabPath ? "active" : ""}`}
                  onClick={() => handleSetActivePath(tabPath)}
                  title={tabPath}
                >
                  <span className="workarea-tab-name">{tabPath.split("/").pop()}</span>
                  {activePath === tabPath && isDirty && (
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--warning)", flexShrink: 0 }} />
                  )}
                  <span className="workarea-tab-close" onClick={(e) => closeTab(e, tabPath)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </span>
                </div>
              ))}
            </div>
          )}

          {activeNotebook && activePath?.endsWith(".cpynb") ? (
            <div className="notebook-container">
              <div style={{ maxWidth: "56rem", margin: "0 auto", width: "100%" }}>
                {activeCells.map((cell, index) => {
                  const codeIndex = activeCells
                    .slice(0, index + 1)
                    .filter((c) => c.cell_type === "code").length - 1;
                  return (
                    <Cell
                      key={cell.id}
                      cell={cell}
                      index={index}
                      codeIndex={codeIndex}
                      executionOrder={executionOrder[cell.id] ?? null}
                      status={statuses[cell.id] ?? "idle"}
                      outputs={outputs[cell.id] ?? []}
                      prompt={prompts[cell.id]}
                      theme={theme}
                      onUpdate={(source) => updateNotebook((c) => ({
                        ...c,
                        cells: c.cells.map(item => item.id === cell.id ? { ...item, source } : item)
                      }))}
                      onRun={() => runCell(cell)}
                      onStop={() => stopCell(cell.id)}
                      onDelete={() => deleteCell(cell.id)}
                      onMove={(dir) => moveCell(cell.id, dir)}
                      onChangeType={(type) => updateNotebook((c) => ({
                        ...c,
                        cells: c.cells.map(item => item.id === cell.id ? { ...item, cell_type: type } : item)
                      }))}
                      onSubmitInput={(val) => submitInput(cell.id, val)}
                      onPromptChange={(val) => setPrompts(p => ({ ...p, [cell.id]: { ...p[cell.id], value: val } }))}
                      onAddCell={addCell}
                      onClearOutputs={() => clearCellOutputs(cell.id)}
                      onClearCell={() => updateNotebook((c) => ({
                        ...c,
                        cells: c.cells.map(item => item.id === cell.id ? { ...item, source: "" } : item)
                      }))}
                    />
                  );
                })}
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem', marginBottom: '2rem' }}>
                   <button onClick={() => addCell(activeCells.length, "code")}>+ Add Code</button>
                   <button onClick={() => addCell(activeCells.length, "markdown")}>+ Add Markdown</button>
                </div>
              </div>
            </div>
          ) : (
            <FileViewer
              activePath={activePath}
              textContent={textContent}
              imageUrl={imageUrl}
              theme={theme}
              baseUrl={api.baseUrl}
              token={token}
              onUpdate={(content) => {
                textContentRef.current = content;
                setTextContent(content);
                setIsDirty(true);
              }}
              onDelete={async (path) => {
                await api.fs.delete(token, path);
                setOpenTabs(prev => prev.filter(p => p !== path));
                if (activePath === path) handleSetActivePath(null);
                loadFileTree();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
