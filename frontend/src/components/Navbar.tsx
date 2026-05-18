/**
 * Navbar.tsx
 * ----------
 * Global top navigation bar for the CppNote application.
 * Contains global controls (save, run all, theme toggle, profile dropdown)
 * and kernel connection status for notebooks.
 */
import React, { useState } from "react";
import { UserProfile, KernelSpec } from "../types";
import { api } from "../lib/api";
import {
  Moon, Sun, Save, Play, Square, RefreshCw, Server, Edit3,
  Loader, Eraser, Wifi, WifiOff, LogOut,
} from "lucide-react";

interface NavbarProps {
  user: UserProfile;
  activePath: string | null;
  theme: "light" | "dark";
  isDirty: boolean;
  isSaved: boolean; // true only after a successful save
  autosaveEnabled: boolean;
  kernels: KernelSpec[];
  selectedKernel: string;
  kernelStatus: "idle" | "busy" | "connecting" | "error";
  runningAll: boolean;
  onThemeToggle: () => void;
  onSave: () => Promise<void>;
  onAutosaveToggle: () => void;
  onRunAll: () => void;
  onStopAll: () => void;
  onClearOutputs: () => void;
  onRestartKernel: () => void;
  onKernelSelect: (k: string) => void;
  onOpenProfile: () => void;
  onLogout: () => void;
  onConnect: () => void;
}

/** Fallback to the first letter of a user's name if no avatar is provided. */
function getAvatarLetter(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/** Normalise avatar URLs (handles absolute HTTP URLs, data URIs, and backend-relative paths). */
function getAvatarUrl(url?: string | null) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  return `${api.baseUrl}${url.startsWith("/") ? url : `/${url}`}`;
}

export function Navbar({
  user, activePath, theme, isDirty, isSaved, autosaveEnabled,
  kernels, selectedKernel, kernelStatus, runningAll,
  onThemeToggle, onSave, onAutosaveToggle, onRunAll, onStopAll,
  onClearOutputs, onRestartKernel, onKernelSelect, onOpenProfile, onLogout, onConnect,
}: NavbarProps) {
  // Determine capabilities based on the currently active file
  const isNotebook = activePath?.endsWith(".cpynb");
  const isEditable = !!activePath && !activePath.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i);
  const fileName = activePath ? activePath.split("/").pop() : null;
  const avatarUrl = getAvatarUrl(user.avatar_url);

  const [saving, setSaving] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropRef = React.useRef<HTMLDivElement>(null);

  // Close profile dropdown when clicking outside of it
  React.useEffect(() => {
    if (!dropdownOpen) return;
    const close = (e: MouseEvent) => { if (!dropRef.current?.contains(e.target as Node)) setDropdownOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [dropdownOpen]);

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(); } finally { setSaving(false); }
  };

  const isConnected = kernelStatus === "idle" || kernelStatus === "busy";
  // User requested: Connect shows in red while connecting or reconnecting. Green only if working.
  const connectColor = isConnected ? "var(--success)" : "var(--error)";

  return (
    <nav className="navbar glass-panel">
      {/* ── Left Section: Save, Run, Clear ── */}
      <div className="nav-section">
        {/* Save — visible for all editable files */}
        {isEditable && (
          <button
            className="nav-icon-btn"
            onClick={handleSave}
            disabled={saving}
            title={isDirty ? "Save (Ctrl+S)" : isSaved ? "Saved" : "Save"}
          >
            {saving ? <Loader size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={16} style={{ color: isDirty ? 'var(--warning)' : 'currentColor' }} />}
          </button>
        )}

        {isNotebook && (
          <>
            <button className="nav-icon-btn" onClick={onClearOutputs} title="Clear all outputs">
              <Eraser size={15} />
            </button>

            {runningAll ? (
              <button
                className="nav-icon-btn running"
                onClick={onStopAll}
                title="Stop all"
              >
                <Square size={15} fill="currentColor" />
              </button>
            ) : (
              <button className="nav-icon-btn" onClick={onRunAll} title="Run all" style={{ color: "var(--success)" }}>
                <Play size={15} fill="currentColor" />
              </button>
            )}

            <div className="nav-divider" />
          </>
        )}

        {/* Autosave Toggle — visible for all editable files */}
        {isEditable && (
          <button
            className={`autosave-pill ${autosaveEnabled ? "on" : "off"}`}
            onClick={onAutosaveToggle}
            type="button"
            aria-pressed={autosaveEnabled}
            title={autosaveEnabled ? "Auto-save On" : "Auto-save Off"}
          >
            <span className="autosave-knob" />
            <span className="autosave-label">{autosaveEnabled ? "AUTO" : "OFF"}</span>
          </button>
        )}
      </div>

      {/* ── Center Section: File Name / App Title ── */}
      <div className="nav-section nav-center-section" style={{ flex: 1, justifyContent: "center" }}>
        <div className="nav-title">
          {runningAll ? (
            <span className="running-pill">● Running All...</span>
          ) : fileName ? (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "var(--muted)", fontSize: 13 }}>{fileName}</span>
              {/* Pulsing unsaved indicator */}
              {isDirty && (
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--warning)", display: "inline-block", animation: "pulse-dot 2s ease infinite" }} />
              )}
            </span>
          ) : (
            <span>
              <span style={{ color: "var(--accent-light)", fontWeight: 700 }}>C++</span>
              <span style={{ color: "var(--muted)", fontWeight: 400 }}> Notebook</span>
            </span>
          )}
        </div>
      </div>

      {/* ── Right Section: Kernel, Theme, Profile ── */}
      <div className="nav-section">
        {isNotebook && (
          <>
            {/* Kernel Selector */}
            <div className="kernel-selector">
              <Server size={11} style={{ opacity: 0.6 }} />
              <select value={selectedKernel} onChange={e => onKernelSelect(e.target.value)}>
                {kernels.map(k => <option key={k.name} value={k.name}>{k.display_name}</option>)}
                {!kernels.find(k => k.name === selectedKernel) && (
                  <option value={selectedKernel}>{selectedKernel}</option>
                )}
              </select>
            </div>

            {/* Connect/Disconnect indicator */}
            <button
              className="nav-icon-btn"
              onClick={onConnect}
              title={isConnected ? "Connected — click to reconnect" : kernelStatus === "connecting" ? "Connecting…" : "Disconnected — click to connect"}
              style={{ color: connectColor }}
            >
              {kernelStatus === "connecting"
                ? <Loader size={14} style={{ animation: "spin 1s linear infinite" }} />
                : isConnected
                  ? <Wifi size={14} />
                  : <WifiOff size={14} />}
            </button>

            {/* Restart Kernel — clears output, execution counts, reconnects */}
            <button className="nav-icon-btn" onClick={onRestartKernel} title="Restart kernel (clears outputs & counts)">
              <RefreshCw size={14} />
            </button>

            <div className="nav-divider" />
          </>
        )}

        {/* Theme Toggle */}
        <button className="nav-icon-btn" onClick={onThemeToggle} title="Toggle theme">
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
        </button>

        {/* User Profile Avatar / Dropdown */}
        <div ref={dropRef} style={{ position: "relative" }}>
          <button className="avatar-btn" onClick={() => setDropdownOpen(o => !o)} title={user.display_name}>
            {avatarUrl
              ? <img src={avatarUrl} alt={user.display_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : getAvatarLetter(user.display_name)}
          </button>
          
          {dropdownOpen && (
            <div className="avatar-dropdown">
              <div className="avatar-dropdown-top">
                <div className="avatar-dropdown-name">{user.display_name}</div>
                <div className="avatar-dropdown-email">{user.email}</div>
              </div>
              <button className="avatar-dropdown-btn" onClick={() => { setDropdownOpen(false); onOpenProfile(); }}>
                <Edit3 size={13} /> Edit Profile
              </button>
              <button className="avatar-dropdown-btn danger" onClick={() => { setDropdownOpen(false); onLogout(); }}>
                <LogOut size={13} /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
