/**
 * FileTree.tsx
 * ------------
 * A recursive tree component that renders files and folders in the workspace.
 * Supports context menus for renaming, deleting, and downloading files.
 */
import {
  ChevronDown, ChevronRight, FileCode, FileImage, FileText,
  Folder, FolderOpen, Plus, Trash, Edit2, File as FileIcon, Download,
} from "lucide-react";
import React, { useState, useCallback } from "react";
import { FileNode } from "../types";

interface FileTreeProps {
  node: FileNode;
  activePath: string | null;
  dirtyPath?: string | null;
  baseUrl?: string;
  token?: string | null;
  onSelect: (path: string) => void;
  onRename: (path: string, newName: string) => void;
  onDelete: (path: string) => void;
  onNewFile: (dirPath: string) => void;
  onNewFolder: (dirPath: string) => void;
  onSelectFolder?: (path: string) => void;
  depth?: number;
}

export function FileTree({
  node, activePath, dirtyPath, baseUrl, token,
  onSelect, onRename, onDelete, onNewFile, onNewFolder, onSelectFolder,
  depth = 0,
}: FileTreeProps) {
  // Folder open/closed state
  const [isOpen, setIsOpen] = useState(true);
  
  // Coordinates for the custom right-click context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  
  // Inline rename state
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState(node.name);

  // The root node (depth=0) is hidden in the UI; we only render its children.
  const isRoot = node.name === "root" && depth === 0;
  const isDir = node.is_dir;
  const isDirty = !isDir && dirtyPath === node.path;
  const isActive = activePath === node.path;

  // Dismiss context menu when clicking elsewhere
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  React.useEffect(() => {
    if (!contextMenu) return;
    const close = () => closeContextMenu();
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu, closeContextMenu]);

  /** Maps file extensions to appropriate icons. */
  const getIcon = () => {
    if (isDir) return isOpen
      ? <FolderOpen size={14} style={{ color: "var(--warning)" }} />
      : <Folder size={14} style={{ color: "var(--warning)" }} />;
    const n = node.name.toLowerCase();
    if (n.endsWith(".cpynb")) return <FileCode size={14} style={{ color: "var(--accent)" }} />;
    if (n.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i)) return <FileImage size={14} style={{ color: "#a78bfa" }} />;
    if (n.match(/\.(md|txt|cpp|c|h|hpp|json|js|ts|py|java|css|html|sh|rs|go)$/)) return <FileText size={14} style={{ color: "var(--muted)" }} />;
    return <FileIcon size={14} style={{ color: "var(--muted)" }} />;
  };

  /** Commit an inline rename operation to the backend. */
  const submitRename = () => {
    setIsRenaming(false);
    if (editName && editName !== node.name) {
      // Reconstruct the full path with the new name
      const parent = node.path.includes("/") ? node.path.substring(0, node.path.lastIndexOf("/")) : "";
      onRename(node.path, parent ? `${parent}/${editName}` : editName);
    } else {
      setEditName(node.name);
    }
  };

  /** Direct download of a file from the workspace. */
  const handleDownload = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!baseUrl || !token) return;
    try {
      const res = await fetch(`${baseUrl}/api/fs/read?path=${encodeURIComponent(node.path)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = node.name; a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    closeContextMenu();
  }, [baseUrl, token, node, closeContextMenu]);

  /** Left click: open file or toggle folder. */
  const handleClick = () => {
    if (isDir) {
      setIsOpen(o => !o);
      onSelectFolder?.(node.path);
    } else {
      onSelect(node.path);
    }
  };

  return (
    <div className="file-node-container" style={{ paddingLeft: isRoot ? 0 : 10 }}>
      {!isRoot && (
        <div
          className={`file-node ${isActive ? "active" : ""}`}
          onClick={handleClick}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
        >
          {/* Node Icon */}
          <span className="file-node-icon">
            {isDir && (
              <span style={{ display: "inline-flex", transition: "transform .2s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", marginRight: 2 }}>
                <ChevronRight size={12} style={{ color: "var(--muted)" }} />
              </span>
            )}
            {!isDir && <span style={{ width: 14, display: "inline-block" }} />}
            {getIcon()}
          </span>

          {/* Label or Rename Input */}
          {isRenaming ? (
            <input
              autoFocus
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={submitRename}
              onKeyDown={e => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") { setIsRenaming(false); setEditName(node.name); } }}
              onClick={e => e.stopPropagation()}
              className="rename-input"
            />
          ) : (
            <span className="file-node-name">{node.name}</span>
          )}

          {/* Unsaved changes indicator */}
          {isDirty && <span className="file-node-dirty" title="Unsaved" />}

          {/* Quick Add button for directories (on hover) */}
          {isDir && (
            <div className="dir-actions" onClick={e => e.stopPropagation()}>
              <button onClick={() => onNewFile(node.path)} title="New file"><Plus size={13} /></button>
            </div>
          )}

          {/* Context Menu Overlay */}
          {contextMenu && (
            <div
              className="context-menu"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => { setIsRenaming(true); closeContextMenu(); }}>
                <Edit2 size={13} /> Rename
              </button>
              {!isDir && (
                <button onClick={handleDownload}>
                  <Download size={13} /> Download
                </button>
              )}
              {isDir && (
                <>
                  <div className="context-menu-sep" />
                  <button onClick={() => { onNewFile(node.path); closeContextMenu(); }}>
                    <Plus size={13} /> Add File
                  </button>
                  <button onClick={() => { onNewFolder(node.path); closeContextMenu(); }}>
                    <Folder size={13} /> Add Folder
                  </button>
                </>
              )}
              <div className="context-menu-sep" />
              <button className="danger" onClick={() => { onDelete(node.path); closeContextMenu(); }}>
                <Trash size={13} /> Delete
              </button>
            </div>
          )}
        </div>
      )}

      {/* Recursive children rendering for open directories */}
      {isDir && isOpen && node.children && (
        <div className="file-children">
          {node.children.map(child => (
            <FileTree
              key={child.path}
              node={child}
              activePath={activePath}
              dirtyPath={dirtyPath}
              baseUrl={baseUrl}
              token={token}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
              onNewFile={onNewFile}
              onNewFolder={onNewFolder}
              onSelectFolder={onSelectFolder}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
