import React, { useState } from "react";
import { ChevronLeft, ChevronRight, FilePlus, FolderPlus, Upload } from "lucide-react";
import { UserProfile, FileNode } from "../types";
import { FileTree } from "./FileTree";

interface SidebarProps {
  user: UserProfile;
  fileTree: FileNode | null;
  activePath: string | null;
  dirtyPath: string | null;
  collapsed: boolean;
  baseUrl: string;
  token: string | null;
  onToggleCollapse: () => void;
  onSelect: (path: string) => void;
  onRename: (path: string, newName: string) => void;
  onDelete: (path: string) => void;
  onNewFile: (dirPath: string, name: string) => void;
  onNewFolder: (dirPath: string, name: string) => void;
  onUpload: () => void;
}

export function Sidebar({
  user, fileTree, activePath, dirtyPath, collapsed, baseUrl, token,
  onToggleCollapse, onSelect, onRename, onDelete, onNewFile, onNewFolder, onUpload,
}: SidebarProps) {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<{ type: "file" | "folder"; dirPath: string; name: string } | null>(null);

  const startCreate = (type: "file" | "folder", dirPath: string) => {
    setCreateDraft({ type, dirPath, name: "" });
  };

  const submitCreate = () => {
    const name = createDraft?.name.trim();
    if (!createDraft || !name) return;
    if (createDraft.type === "file") {
      onNewFile(createDraft.dirPath, name);
    } else {
      onNewFolder(createDraft.dirPath, name);
    }
    setCreateDraft(null);
  };

  return (
    <>
      <aside className={`sidebar glass-panel ${collapsed ? "collapsed" : ""}`}>
        {/* Action buttons */}
        <div className="sidebar-actions">
          <button className="nav-icon-btn" title="New File" onClick={() => startCreate("file", selectedFolder ?? "")} style={{ flex: 1, borderRadius: 8 }}>
            <FilePlus size={15} />
          </button>
          <button className="nav-icon-btn" title="New Folder" onClick={() => startCreate("folder", selectedFolder ?? "")} style={{ flex: 1, borderRadius: 8 }}>
            <FolderPlus size={15} />
          </button>
          <button className="nav-icon-btn" title="Upload File" onClick={onUpload} style={{ flex: 1, borderRadius: 8 }}>
            <Upload size={15} />
          </button>
        </div>

        {createDraft && (
          <div className="inline-create-row">
            <span className="inline-create-icon">
              {createDraft.type === "file" ? <FilePlus size={13} /> : <FolderPlus size={13} />}
            </span>
            <input
              autoFocus
              value={createDraft.name}
              onChange={e => setCreateDraft(draft => draft ? { ...draft, name: e.target.value } : draft)}
              onBlur={() => {
                if (!createDraft.name.trim()) setCreateDraft(null);
              }}
              onKeyDown={e => {
                if (e.key === "Enter") submitCreate();
                if (e.key === "Escape") setCreateDraft(null);
              }}
              placeholder={createDraft.type === "file" ? "main.cpp" : "folder name"}
              className="inline-create-input"
            />
          </div>
        )}

        {/* Active file path strip */}
        {activePath && (
          <div style={{
            fontSize: 10, color: "var(--accent-light)", padding: "6px 12px",
            borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            background: "rgba(8,145,178,0.1)",
          }} title={`/${activePath}`}>
            📄 /{activePath}
          </div>
        )}
        {/* Workspace label below path strip */}
        <div className="workspace-label">
          Workspace
        </div>
        <div className="workspace-tree">
          {fileTree && (
            <FileTree
              node={fileTree}
              activePath={activePath}
              dirtyPath={dirtyPath}
              baseUrl={baseUrl}
              token={token}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
              onNewFile={(dirPath) => startCreate("file", dirPath)}
              onNewFolder={(dirPath) => startCreate("folder", dirPath)}
              onSelectFolder={setSelectedFolder}
            />
          )}
        </div>
      </aside>

      <button
        style={{
          position: "absolute",
          left: collapsed ? "0" : "var(--sidebar-w)",
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 50,
          background: "var(--panel2)",
          border: "1px solid var(--line)",
          borderLeft: "none",
          borderRadius: "0 8px 8px 0",
          padding: "12px 4px",
          cursor: "pointer",
          color: "var(--muted)",
          transition: "left 0.3s ease",
          width: 18,
        }}
        onClick={onToggleCollapse}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </>
  );
}
