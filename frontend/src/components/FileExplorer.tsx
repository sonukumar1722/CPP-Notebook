import { ChevronDown, ChevronRight, File, FileCode, FileImage, FileText, Folder, Plus, Trash, Edit2 } from "lucide-react";
import React, { useState } from "react";
import { FileNode } from "../types";

interface FileExplorerProps {
  node: FileNode;
  activePath: string | null;
  onSelect: (path: string) => void;
  onRename: (path: string, newName: string) => void;
  onDelete: (path: string) => void;
  onNewFile: (dirPath: string) => void;
  onNewFolder: (dirPath: string) => void;
  depth?: number;
}

export function FileExplorer({
  node,
  activePath,
  onSelect,
  onRename,
  onDelete,
  onNewFile,
  onNewFolder,
  depth = 0
}: FileExplorerProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState(node.name);

  const isRoot = node.name === "root" && depth === 0;
  const isDir = node.is_dir;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isRoot) {
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  React.useEffect(() => {
    window.addEventListener("click", closeContextMenu);
    return () => window.removeEventListener("click", closeContextMenu);
  }, []);

  const getIcon = () => {
    if (isDir) return isOpen ? <Folder size={16} /> : <Folder size={16} />;
    if (node.name.endsWith(".cpynb")) return <FileCode size={16} />;
    if (node.name.endsWith(".md") || node.name.endsWith(".txt")) return <FileText size={16} />;
    if (node.name.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i)) return <FileImage size={16} />;
    return <File size={16} />;
  };

  const submitRename = () => {
    setIsRenaming(false);
    if (editName && editName !== node.name) {
      const parentPath = node.path.substring(0, node.path.lastIndexOf("/"));
      const newPath = parentPath ? `${parentPath}/${editName}` : editName;
      onRename(node.path, newPath);
    } else {
      setEditName(node.name);
    }
  };

  return (
    <div className="file-node-container" style={{ paddingLeft: isRoot ? 0 : 12 }}>
      {!isRoot && (
        <div
          className={`file-node ${activePath === node.path ? "active" : ""}`}
          onClick={() => (isDir ? setIsOpen(!isOpen) : onSelect(node.path))}
          onContextMenu={handleContextMenu}
        >
          <span className="file-node-icon">
            {isDir && (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
            {!isDir && <span style={{ width: 14, display: "inline-block" }} />}
            {getIcon()}
          </span>

          {isRenaming ? (
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={submitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename();
                if (e.key === "Escape") {
                  setIsRenaming(false);
                  setEditName(node.name);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="rename-input"
            />
          ) : (
            <span className="file-node-name">{node.name}</span>
          )}

          {isDir && (
            <div className="dir-actions" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => onNewFile(node.path)} title="New File"><Plus size={14} /></button>
            </div>
          )}

          {contextMenu && (
            <div
              className="context-menu"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={() => { setIsRenaming(true); closeContextMenu(); }}>
                <Edit2 size={14} /> Rename
              </button>
              <button onClick={() => { onDelete(node.path); closeContextMenu(); }} className="danger">
                <Trash size={14} /> Delete
              </button>
            </div>
          )}
        </div>
      )}

      {isDir && isOpen && node.children && (
        <div className="file-children">
          {node.children.map((child) => (
            <FileExplorer
              key={child.path}
              node={child}
              activePath={activePath}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
              onNewFile={onNewFile}
              onNewFolder={onNewFolder}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
