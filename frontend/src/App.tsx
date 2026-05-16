import { cpp } from "@codemirror/lang-cpp";
import CodeMirror from "@uiw/react-codemirror";
import { marked } from "marked";
import React, { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Moon, Sun, Save, Play, RefreshCw, Server, Plus } from "lucide-react";

import { api } from "./lib/api";
import {
  AuthResponse,
  CellStatus,
  KernelSpec,
  Notebook,
  NotebookCell,
  OutputItem,
  UserProfile,
  FileNode
} from "./types";
import { FileExplorer } from "./components/FileExplorer";

const WS_BASE = "ws://localhost:8000";

function uid() {
  return crypto.randomUUID();
}

function sortCells(cells: NotebookCell[]) {
  return [...cells].sort((a, b) => a.position - b.position);
}

function normalizedCells(cells: NotebookCell[]): NotebookCell[] {
  return sortCells(cells).map((cell, index) => ({ ...cell, position: index }));
}

function renderOutput(output: OutputItem, index: number) {
  if (output.kind === "stream") {
    return (
      <pre className={`output-block output-${output.stream}`} key={index}>
        {output.text}
      </pre>
    );
  }

  if (output.kind === "error") {
    return (
      <pre className="output-block output-error" key={index}>
        {[output.ename, output.evalue, ...(output.traceback ?? [])].filter(Boolean).join("\n")}
      </pre>
    );
  }

  const data = output.data ?? {};
  if (data["image/png"]) {
    return <img className="output-image" key={index} src={`data:image/png;base64,${data["image/png"]}`} />;
  }
  if (data["image/jpeg"]) {
    return <img className="output-image" key={index} src={`data:image/jpeg;base64,${data["image/jpeg"]}`} />;
  }
  if (data["text/html"]) {
    return <div className="output-html" key={index} dangerouslySetInnerHTML={{ __html: data["text/html"] }} />;
  }
  if (data["text/plain"]) {
    return (
      <pre className="output-block output-plain" key={index}>
        {data["text/plain"]}
      </pre>
    );
  }
  return null;
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("cppnote-token"));
  const [user, setUser] = useState<UserProfile | null>(null);
  
  // File System State
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  
  // Editor State
  const [activeNotebook, setActiveNotebook] = useState<Notebook | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  
  // App Config
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [kernels, setKernels] = useState<KernelSpec[]>([]);
  
  // Notebook Execution State
  const [outputs, setOutputs] = useState<Record<string, OutputItem[]>>({});
  const [statuses, setStatuses] = useState<Record<string, CellStatus>>({});
  const [prompts, setPrompts] = useState<Record<string, { prompt: string; value: string }>>({});
  
  // Auth State
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // In-app dialog state (replaces window.prompt)
  const [dialog, setDialog] = useState<{ title: string; placeholder: string; onConfirm: (v: string) => void } | null>(null);
  const [dialogValue, setDialogValue] = useState("");
  const dialogInputRef = useRef<HTMLInputElement>(null);

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

  const socketRef = useRef<WebSocket | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  const activeCells = useMemo(() => sortCells(activeNotebook?.cells ?? []), [activeNotebook]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!token) return;
    api.me(token).then(setUser).catch(() => {
      localStorage.removeItem("cppnote-token");
      setToken(null);
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

  // Load selected file
  useEffect(() => {
    if (!token || !activePath) return;
    
    // Clear previous state
    setActiveNotebook(null);
    setTextContent(null);
    setOutputs({});
    setStatuses({});
    setPrompts({});
    socketRef.current?.close();
    
    const ext = activePath.split('.').pop()?.toLowerCase();
    
    if (ext === "cpynb") {
      api.fs.read(token, activePath).then((data) => {
        if (typeof data === "string") {
          setActiveNotebook(JSON.parse(data));
        } else {
          setActiveNotebook(data as Notebook);
        }
      }).catch(console.error);
    } else if (["txt", "md", "cpp", "h"].includes(ext || "")) {
      api.fs.read(token, activePath).then((data) => {
        setTextContent(typeof data === "string" ? data : "");
      }).catch(console.error);
    }
    
  }, [token, activePath]);

  // WebSocket for notebooks
  useEffect(() => {
    if (!token || !activePath || !activePath.endsWith(".cpynb")) return;

    const socket = new WebSocket(`${WS_BASE}/ws/notebooks/${activePath}?token=${token}`);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const cellId = message.cellId as string | undefined;

      if (message.type === "cell.queued" && cellId) {
        setStatuses((state) => ({ ...state, [cellId]: "queued" }));
      }
      if (message.type === "cell.running" && cellId) {
        setStatuses((state) => ({ ...state, [cellId]: "running" }));
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
      }
      if (message.type === "cell.clear" && cellId) {
        setOutputs((state) => ({ ...state, [cellId]: [] }));
      }
      if (message.type === "cell.input_request" && cellId) {
        setStatuses((state) => ({ ...state, [cellId]: "waiting-input" }));
        setPrompts((state) => ({ ...state, [cellId]: { prompt: message.prompt ?? "", value: "" } }));
      }
      if (message.type === "kernel.status" && cellId && message.state === "idle") {
        setStatuses((state) => {
          if (state[cellId] === "error") return state;
          return { ...state, [cellId]: "success" };
        });
        setPrompts((state) => {
          const next = { ...state };
          delete next[cellId];
          return next;
        });
      }
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [token, activePath]);

  // Auto-save notebook
  useEffect(() => {
    if (!token || !activeNotebook || !activePath) return;
    if (!activeNotebook.autosave_enabled) return;
    
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    
    saveTimerRef.current = window.setTimeout(() => {
      api.fs.write(token, activePath, {
        ...activeNotebook,
        cells: normalizedCells(activeNotebook.cells)
      }).catch(console.error);
    }, 1000);
  }, [activeNotebook, token, activePath]);
  
  // Auto-save text file
  useEffect(() => {
    if (!token || typeof textContent !== "string" || !activePath) return;
    if (activePath.endsWith(".cpynb")) return;
    
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    
    saveTimerRef.current = window.setTimeout(() => {
      api.fs.write(token, activePath, textContent).catch(console.error);
    }, 1000);
  }, [textContent, token, activePath]);

  const authenticate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError(null);
    setLoading(true);
    const form = new FormData(event.currentTarget);
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
    setActiveNotebook((current) => (current ? updater(current) : current));
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

  const moveCell = (cellId: string, direction: -1 | 1) => {
    updateNotebook((current) => {
      const next = sortCells(current.cells);
      const index = next.findIndex((cell) => cell.id === cellId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, cells: normalizedCells(next) };
    });
  };

  const runCell = (cell: NotebookCell) => {
    setOutputs((state) => ({ ...state, [cell.id]: [] }));
    socketRef.current?.send(
      JSON.stringify({
        type: "execute",
        cellId: cell.id,
        source: cell.source,
      })
    );
  };

  const runAll = () => {
    activeCells.filter((cell) => cell.cell_type === "code").forEach(runCell);
  };

  const submitInput = (cellId: string) => {
    const prompt = prompts[cellId];
    if (!prompt) return;
    socketRef.current?.send(JSON.stringify({ type: "input_reply", value: prompt.value }));
    setPrompts((state) => {
      const next = { ...state };
      delete next[cellId];
      return next;
    });
    setStatuses((state) => ({ ...state, [cellId]: "running" }));
  };

  const handleCreateFile = (dirPath: string) => {
    if (!token) return;
    openDialog("New file", "e.g. main.cpp, notes.md, notebook.cpynb", async (name) => {
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
      setActivePath(newPath);
    });
  };

  const handleCreateFolder = (dirPath: string) => {
    if (!token) return;
    openDialog("New folder", "folder name", async (name) => {
      const newPath = dirPath === "" ? `${name}/.keep` : `${dirPath}/${name}/.keep`;
      await api.fs.write(token, newPath, "");
      await loadFileTree();
    });
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!token || !activePath) return;
    const parentDir = activePath.substring(0, activePath.lastIndexOf("/"));
    
    for (const file of acceptedFiles) {
      await api.fs.upload(token, parentDir, file);
    }
    await loadFileTree();
  }, [token, activePath, loadFileTree]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, noClick: true });

  if (!token || !user) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="eyebrow">CppNote</p>
          <h1>Interactive C++ notebooks</h1>
          <div className="auth-tabs">
            <button className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>Login</button>
            <button className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>Register</button>
          </div>
          <form onSubmit={authenticate} className="auth-form">
            <input name="email" type="email" placeholder="Email" required />
            {authMode === "register" && <input name="displayName" placeholder="Display name" minLength={2} required />}
            <input name="password" type="password" placeholder="Password" minLength={8} required />
            {authError && <p className="form-error">{authError}</p>}
            <button type="submit" disabled={loading}>{loading ? "Working..." : authMode === "login" ? "Login" : "Create account"}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell" {...getRootProps()}>
      {/* In-app dialog */}
      {dialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--surface, #fff)', borderRadius: '12px', padding: '1.5rem', minWidth: '320px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 1rem' }}>{dialog.title}</h3>
            <input
              ref={dialogInputRef}
              value={dialogValue}
              onChange={e => setDialogValue(e.target.value)}
              placeholder={dialog.placeholder}
              onKeyDown={e => { if (e.key === 'Enter') confirmDialog(); if (e.key === 'Escape') setDialog(null); }}
              style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem', borderRadius: '6px', border: '1px solid #ccc', fontSize: '1rem', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setDialog(null)} style={{ padding: '0.4rem 1rem' }}>Cancel</button>
              <button onClick={confirmDialog} style={{ padding: '0.4rem 1rem', background: '#c0392b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Create</button>
            </div>
          </div>
        </div>
      )}
      <input {...getInputProps()} />
      {isDragActive && (
        <div className="dropzone-overlay">
          Drop files to upload
        </div>
      )}
      
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Workspace</p>
          <h2>{user.display_name}</h2>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button className="primary-button" onClick={() => handleCreateFile("")} style={{ flex: 1, padding: '0.4rem' }}>
            <Plus size={16} /> File
          </button>
          <button onClick={() => handleCreateFolder("")} style={{ flex: 1, padding: '0.4rem' }}>
            <Plus size={16} /> Folder
          </button>
        </div>
        <div className="notebook-list" style={{ marginTop: '1rem' }}>
          {fileTree && (
            <FileExplorer 
              node={fileTree} 
              activePath={activePath} 
              onSelect={setActivePath} 
              onRename={async (oldP, newP) => {
                await api.fs.rename(token, oldP, newP);
                if (activePath === oldP) setActivePath(newP);
                loadFileTree();
              }}
              onDelete={async (path) => {
                await api.fs.delete(token, path);
                if (activePath === path) setActivePath(null);
                loadFileTree();
              }}
              onNewFile={handleCreateFile}
              onNewFolder={handleCreateFolder}
            />
          )}
        </div>
      </aside>

      <main className="main-panel">
        <header className="toolbar" style={{ marginBottom: '1.5rem' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0 }}>{activePath?.split('/').pop() || "No file selected"}</h2>
            <p className="toolbar-subtitle">{activePath || "Select a file from the explorer"}</p>
          </div>
          <div className="toolbar-actions">
            {activeNotebook && (
              <>
                <label className="kernel-select" title="Kernel">
                  <Server size={18} />
                  <select
                    value={activeNotebook.kernel_name}
                    onChange={(event) => updateNotebook(c => ({...c, kernel_name: event.target.value}))}
                  >
                    {kernels.length === 0 && <option value={activeNotebook.kernel_name}>{activeNotebook.kernel_name}</option>}
                    {kernels.map((kernel) => (
                      <option key={kernel.name} value={kernel.name}>{kernel.display_name}</option>
                    ))}
                  </select>
                </label>
                <label className="toggle" title="Auto-save">
                  <input
                    type="checkbox"
                    checked={activeNotebook.autosave_enabled}
                    onChange={(event) => updateNotebook(c => ({...c, autosave_enabled: event.target.checked}))}
                  />
                  <Save size={18} />
                </label>
                <button onClick={runAll} title="Run All"><Play size={18} /></button>
                <button onClick={() => socketRef.current?.send(JSON.stringify({ type: "restart" }))} title="Restart Kernel">
                  <RefreshCw size={18} />
                </button>
              </>
            )}
            <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} title="Toggle Theme">
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </header>

        {activeNotebook && activePath?.endsWith(".cpynb") && (
          <section className="cells">
            {activeCells.map((cell, index) => (
              <article className="cell-card" key={cell.id}>
                <div className="cell-header">
                  <div className="cell-meta">
                    <span className={`status-pill status-${statuses[cell.id] ?? "idle"}`}>
                      {statuses[cell.id] ?? "idle"}
                    </span>
                    <span>{cell.cell_type}</span>
                  </div>
                  <div className="cell-actions">
                    <button onClick={() => addCell(index, "markdown")}>+ Markdown</button>
                    <button onClick={() => addCell(index, "code")}>+ Code</button>
                    <button onClick={() => moveCell(cell.id, -1)}>↑</button>
                    <button onClick={() => moveCell(cell.id, 1)}>↓</button>
                    {cell.cell_type === "code" && <button onClick={() => runCell(cell)}>Run</button>}
                    <button onClick={() => deleteCell(cell.id)}>Del</button>
                  </div>
                </div>

                {cell.cell_type === "markdown" ? (
                  <div className="markdown-editor">
                    <textarea
                      value={cell.source}
                      onChange={(event) =>
                        updateNotebook((current) => ({
                          ...current,
                          cells: current.cells.map((item) =>
                            item.id === cell.id ? { ...item, source: event.target.value } : item
                          ),
                        }))
                      }
                    />
                    <div
                      className="markdown-preview"
                      dangerouslySetInnerHTML={{ __html: marked.parse(cell.source) as string }}
                    />
                  </div>
                ) : (
                  <>
                    <CodeMirror
                      value={cell.source}
                      height="auto"
                      extensions={[cpp()]}
                      theme={theme}
                      onChange={(value) =>
                        updateNotebook((current) => ({
                          ...current,
                          cells: current.cells.map((item) => (item.id === cell.id ? { ...item, source: value } : item)),
                        }))
                      }
                    />
                    <div className="output-panel">
                      {(outputs[cell.id] ?? []).map(renderOutput)}
                      {prompts[cell.id] && (
                        <div className="stdin-box">
                          <label>{prompts[cell.id].prompt || "Input required"}</label>
                          <input
                            value={prompts[cell.id].value}
                            onChange={(event) =>
                              setPrompts((state) => ({
                                ...state,
                                [cell.id]: { ...state[cell.id], value: event.target.value },
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") submitInput(cell.id);
                            }}
                          />
                          <button onClick={() => submitInput(cell.id)}>Send</button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </article>
            ))}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem' }}>
               <button onClick={() => addCell(activeCells.length, "markdown")}>+ Add Markdown</button>
               <button onClick={() => addCell(activeCells.length, "code")}>+ Add Code</button>
            </div>
          </section>
        )}

        {textContent !== null && !activePath?.endsWith(".cpynb") && (
          <div className="cell-card" style={{ height: 'calc(100vh - 150px)', display: 'flex', flexDirection: 'column' }}>
            <CodeMirror
              value={textContent}
              height="100%"
              extensions={activePath?.endsWith(".cpp") || activePath?.endsWith(".h") ? [cpp()] : []}
              theme={theme}
              onChange={(value) => setTextContent(value)}
              style={{ flex: 1, overflow: 'auto' }}
            />
          </div>
        )}
        
        {activePath?.match(/\.(png|jpg|jpeg|gif|webp)$/i) && (
          <div className="cell-card" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <img 
              src={`${api.baseUrl}/api/fs/read?path=${encodeURIComponent(activePath)}`} 
              alt={activePath} 
              style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '12px' }} 
            />
          </div>
        )}

        {!activeNotebook && textContent === null && !activePath?.match(/\.(png|jpg|jpeg|gif|webp)$/i) && (
          <div className="empty-state">
            <h2>Select a file to begin</h2>
          </div>
        )}
      </main>
    </div>
  );
}
