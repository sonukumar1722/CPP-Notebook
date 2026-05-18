/**
 * ProfileModal.tsx
 * ----------------
 * A modal overlay that allows users to edit their display name, bio, and avatar.
 * Handles both plain text JSON updates and multipart/form-data for image uploads.
 */
import React, { useState, useRef } from "react";
import { UserProfile } from "../types";
import { X, Camera, User } from "lucide-react";

const API_BASE = "http://localhost:8000";

interface ProfileModalProps {
  user: UserProfile;
  token: string;
  onClose: () => void;
  onLogout: () => void;
  onSave: (name: string, bio: string, avatarUrl?: string) => Promise<void>;
}

/** Fallback to the first letter of a user's name if no avatar is provided. */
function getAvatarLetter(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/** Normalise avatar URLs (handles absolute HTTP URLs, data URIs, and backend-relative paths). */
function getAvatarUrl(url?: string | null) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

export function ProfileModal({ user, token, onClose, onLogout, onSave }: ProfileModalProps) {
  const [name, setName] = useState(user.display_name);
  const [bio, setBio] = useState(user.bio || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Track local preview data URI and the actual File object to be uploaded
  const [avatarPreview, setAvatarPreview] = useState<string | null>(() => getAvatarUrl(user.avatar_url));
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Handles image selection from the hidden file input. */
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Image must be under 5 MB"); return; }
    
    setError(null);
    setAvatarFile(file);
    
    // Read the file locally to show a preview immediately
    const reader = new FileReader();
    reader.onload = ev => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  /** Saves profile changes via the appropriate API endpoint based on whether an image was attached. */
  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      let newAvatarUrl: string | undefined;
      
      // If a new avatar was selected, we must use a multipart form upload
      if (avatarFile) {
        const fd = new FormData();
        fd.append("file", avatarFile);
        fd.append("display_name", name);
        fd.append("bio", bio);
        const res = await fetch(`${API_BASE}/api/auth/profile`, {
          method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail || "Failed");
        const data = await res.json();
        newAvatarUrl = data.avatar_url;
      } else {
        // Just updating text fields; standard JSON request
        const res = await fetch(`${API_BASE}/api/auth/profile`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ display_name: name, bio }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail || "Failed");
      }
      
      // Bubble the updated details back to the App component
      await onSave(name, bio, newAvatarUrl);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="profile-backdrop" onClick={onClose} />
      <div className="profile-panel">
        {/* Header */}
        <div className="profile-header">
          <span className="profile-title">Edit Profile</span>
          <button
            className="profile-close-btn"
            onClick={onClose}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="profile-body">
          {/* Avatar Area */}
          <div className="avatar-section">
            <div style={{ position: "relative" }}>
              <div
                className="avatar-ring"
                onClick={() => fileRef.current?.click()}
                title="Change photo"
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span className="avatar-initials">{getAvatarLetter(name)}</span>
                )}
              </div>
              <div className="avatar-edit-btn" onClick={() => fileRef.current?.click()}>
                <Camera size={13} />
              </div>
            </div>
            {/* Hidden file input triggered by clicking the avatar */}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
            <span style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>Click avatar to change photo</span>
          </div>

          {/* Error Message */}
          {error && (
            <div className="profile-error">
              {error}
            </div>
          )}

          {/* Form Fields */}
          <div className="profile-field">
            <label>Email</label>
            <input className="profile-input" value={user.email} disabled />
          </div>

          <div className="profile-field">
            <label>Display Name</label>
            <input
              className="profile-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          <div className="profile-field">
            <label>Bio</label>
            <textarea
              className="profile-input"
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Tell us about yourself…"
              style={{ minHeight: 90 }}
            />
          </div>

          {/* Action Buttons */}
          <button
            className="profile-save-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>

          <div style={{ height: 1, background: "var(--line)", margin: "8px 0" }} />

          <button
            onClick={onLogout}
            style={{ width: "100%", background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", color: "var(--error)", borderRadius: 10, height: 44, fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}
          >
            Logout
          </button>
        </div>
      </div>
    </>
  );
}
