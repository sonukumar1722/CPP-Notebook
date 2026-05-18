/**
 * FileViewer.tsx
 * --------------
 * Dynamic viewer for various file types when opened from the sidebar.
 * Includes sub-components for:
 *   - Images (with pan/zoom)
 *   - Markdown (with toggleable edit/preview modes)
 *   - Plain Text/Code (Monaco editor with syntax highlighting)
 *   - Unsupported/Binary (shows download/delete options)
 */
import React, { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { ZoomIn, ZoomOut, Maximize2, ImageOff, FileQuestion, Download, Trash2, Eye, Edit3 } from "lucide-react";
import Editor from "@monaco-editor/react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus, vs } from "react-syntax-highlighter/dist/esm/styles/prism";

interface FileViewerProps {
  activePath: string | null;
  textContent: string | null;
  imageUrl?: string | null;
  theme: "light" | "dark";
  baseUrl: string;
  token?: string | null;
  onUpdate: (content: string) => void;
  onDelete?: (path: string) => void;
}

// Sets of known file extensions mapped to viewers
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
const TEXT_EXTS = new Set([
  "txt", "md", "cpp", "c", "h", "hpp", "js", "jsx", "ts", "tsx",
  "json", "py", "java", "css", "html", "sh", "bash", "yml", "yaml",
  "xml", "rs", "go", "rb", "toml", "ini", "cfg", "conf",
]);

function getExt(path: string) {
  const p = path.split("."); return p.length > 1 ? p.pop()!.toLowerCase() : "";
}
function getFileName(path: string) { return path.split("/").pop() || path; }

// ── Image Viewer ──────────────────────────────────────────────
function ImageViewer({ imageUrl, activePath }: { imageUrl: string | null; activePath: string }) {
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true); // "fit to window" mode

  if (!imageUrl) return (
    <div className="empty-state">
      <ImageOff size={40} style={{ opacity: 0.25, marginBottom: 12 }} />
      <p style={{ color: "var(--muted)" }}>Loading image…</p>
    </div>
  );

  return (
    <div className="image-viewer-shell">
      <div className="image-viewer-toolbar">
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{getFileName(activePath)}</span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button className="icon-button" onClick={() => { setFit(false); setZoom(z => Math.max(z - 0.25, 0.1)); }}><ZoomOut size={14} /></button>
          <span style={{ fontSize: 11, minWidth: 36, textAlign: "center", color: "var(--muted)" }}>{fit ? "fit" : `${Math.round(zoom * 100)}%`}</span>
          <button className="icon-button" onClick={() => { setFit(false); setZoom(z => Math.min(z + 0.25, 5)); }}><ZoomIn size={14} /></button>
          <button className="icon-button" onClick={() => { setFit(true); setZoom(1); }}><Maximize2 size={14} /></button>
        </div>
      </div>
      <div className="image-viewer-canvas">
        <img
          src={imageUrl} alt={getFileName(activePath)}
          style={fit
            ? { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8, boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }
            : { transform: `scale(${zoom})`, transformOrigin: "center", maxWidth: "none", borderRadius: 8 }}
          draggable={false}
        />
      </div>
    </div>
  );
}

// ── Markdown Viewer — preview/edit toggle top-right ───────────
function MarkdownViewer({ textContent, theme, onUpdate }: { textContent: string; theme: "light" | "dark"; onUpdate: (v: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="markdown-file-shell">
      {isEditing ? (
        <div className="markdown-file-body">
          <div className="markdown-file-doc markdown-file-doc-editing">
            <button
              className="markdown-corner-btn"
              onClick={() => setIsEditing(false)}
              title="Switch to preview"
              type="button"
            >
              <Eye size={15} />
            </button>
            <Editor
              height="100%"
              language="markdown"
              theme={theme === "dark" ? "vs-dark" : "light"}
              value={textContent}
              onChange={val => onUpdate(val ?? "")}
              onMount={(editor) => {
                // Auto-switch to preview mode when clicking away from the editor
                editor.onDidBlurEditorWidget(() => setIsEditing(false));
              }}
              options={{
                minimap: { enabled: false },
                wordWrap: "on",
                padding: { top: 48, bottom: 24 },
                fontSize: 14,
              }}
            />
          </div>
        </div>
      ) : (
        <div className="markdown-file-body">
          <div className="markdown-file-doc" onClick={() => setIsEditing(true)}>
            <ReactMarkdown
              components={{
                code({node, inline, className, children, ...props}: any) {
                  const match = /language-(\w+)/.exec(className || "");
                  return !inline && match ? (
                    <SyntaxHighlighter
                      {...props}
                      children={String(children).replace(/\n$/, "")}
                      style={theme === "dark" ? vscDarkPlus as any : vs as any}
                      language={match[1]}
                      PreTag="div"
                    />
                  ) : (
                    <code {...props} className={className}>
                      {children}
                    </code>
                  );
                }
              }}
            >{textContent || "*Empty file — click anywhere to start writing*"}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Plain Text Viewer — simple textarea ───────────────────────
function TextViewer({ textContent, theme, activePath, onUpdate }: { textContent: string; theme: "light" | "dark"; activePath: string; onUpdate: (v: string) => void }) {
  const [fontSize, setFontSize] = useState(14);
  const ext = getExt(activePath);
  
  // Map file extensions to Monaco language identifiers
  const langMap: Record<string, string> = {
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    cpp: "cpp", c: "c", h: "cpp", hpp: "cpp", py: "python", java: "java",
    json: "json", css: "css", html: "html", sh: "shell", bash: "shell",
    xml: "xml", rs: "rust", go: "go", sql: "sql", yaml: "yaml", yml: "yaml",
  };
  const lang = langMap[ext] || "plaintext";

  return (
    <div style={{ flex: 1, overflow: "hidden", padding: "32px", display: "flex", justifyContent: "center", position: "relative" }}>
      <div style={{
        width: "100%", maxWidth: "56rem",
        background: "var(--bg)", border: "1px solid var(--line)",
        borderRadius: 12, overflow: "hidden", minHeight: 500,
        boxShadow: "var(--shadow)"
      }}>
        <div style={{ padding: "8px 16px", background: "var(--panel)", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: "monospace" }}>{getFileName(activePath)}</span>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <button className="icon-button" onClick={() => setFontSize(size => Math.max(size - 1, 10))} title="Zoom out" type="button">
              <ZoomOut size={14} />
            </button>
            <span style={{ fontSize: 11, minWidth: 36, textAlign: "center", color: "var(--muted)" }}>{fontSize}px</span>
            <button className="icon-button" onClick={() => setFontSize(size => Math.min(size + 1, 28))} title="Zoom in" type="button">
              <ZoomIn size={14} />
            </button>
          </div>
        </div>
        <div style={{ height: "calc(100% - 37px)" }}>
          <Editor
            height="100%"
            language={lang}
            theme={theme === "dark" ? "vs-dark" : "light"}
            value={textContent}
            onChange={val => onUpdate(val ?? "")}
            options={{
              minimap: { enabled: true },
              wordWrap: "on",
              padding: { top: 16, bottom: 16 },
              fontSize,
              scrollBeyondLastLine: false,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Unsupported ───────────────────────────────────────────────
function UnsupportedFile({ activePath, baseUrl, token, onDelete }: {
  activePath: string; baseUrl: string; token?: string | null; onDelete?: (p: string) => void;
}) {
  const name = getFileName(activePath);
  const ext = getExt(activePath);
  
  // Directly trigger a download of the binary file
  const handleDownload = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/api/fs/read?path=${encodeURIComponent(activePath)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  }, [activePath, baseUrl, token, name]);

  return (
    <div className="empty-state">
      <FileQuestion size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
      <h3 style={{ color: "var(--ink)", marginBottom: 6 }}>{name}</h3>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>
        {ext ? `".${ext}" files cannot be previewed.` : "Binary file."}
      </p>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={handleDownload}><Download size={14} /> Download</button>
        {onDelete && (
          <button onClick={() => onDelete(activePath)} style={{ color: "var(--error)", borderColor: "var(--error)" }}>
            <Trash2 size={14} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main FileViewer ───────────────────────────────────────────
export function FileViewer({ activePath, textContent, imageUrl, theme, baseUrl, token, onUpdate, onDelete }: FileViewerProps) {
  // Render empty state if no file is selected
  if (!activePath) {
    return (
      <div className="empty-state">
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: 16, opacity: 0.12 }}>📂</div>
          <h2 style={{ color: "var(--muted)", fontWeight: 400, fontSize: "1.1rem" }}>Select a file to begin</h2>
          <p style={{ color: "var(--muted)", fontSize: 13, opacity: 0.6, marginTop: 8 }}>Use the sidebar to navigate your workspace</p>
        </div>
      </div>
    );
  }

  const ext = getExt(activePath);

  // Dispatch to sub-components based on file extension
  if (IMAGE_EXTS.has(ext)) return <ImageViewer imageUrl={imageUrl ?? null} activePath={activePath} />;
  if (ext === "md" && textContent !== null) return <MarkdownViewer textContent={textContent} theme={theme} onUpdate={onUpdate} />;
  if (TEXT_EXTS.has(ext) && textContent !== null) return <TextViewer textContent={textContent} theme={theme} activePath={activePath} onUpdate={onUpdate} />;

  // Still loading text content
  if ((TEXT_EXTS.has(ext) || ext === "md") && textContent === null) {
    return <div className="empty-state"><p style={{ color: "var(--muted)" }}>Loading…</p></div>;
  }

  // Fallback for unsupported binary/unknown files
  return <UnsupportedFile activePath={activePath} baseUrl={baseUrl} token={token} onDelete={onDelete} />;
}
