import { ChangeEvent, useRef, useState } from "react";
import { Icon } from "./Icon";

type ProfileModalProps = {
  open: boolean;
  photoUrl: string | null;
  onClose: () => void;
  onPhotoChange: (url: string | null) => void;
  onError: (message: string) => void;
};

async function normalizeProfilePhoto(file: File): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("That image could not be opened"));
      image.src = objectUrl;
    });

    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new Error("That image could not be opened");

    const crop = Math.min(width, height);
    const sx = Math.max(0, (width - crop) / 2);
    const sy = Math.max(0, (height - crop) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo processing is unavailable");
    context.drawImage(image, sx, sy, crop, crop, 0, 0, 512, 512);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new Error("Photo processing failed");
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ProfileModal({ open, photoUrl, onClose, onPhotoChange, onError }: ProfileModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const uploadPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    try {
      const normalized = await normalizeProfilePhoto(file);
      const form = new FormData();
      form.append("photo", new File([normalized], "profile.jpg", { type: "image/jpeg" }));
      const response = await fetch("/api/profile/photo", { method: "PUT", body: form });
      const data = await response.json().catch(() => ({})) as { error?: string; version?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save profile photo");
      onPhotoChange(`/api/profile/photo?v=${encodeURIComponent(data.version ?? String(Date.now()))}`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save profile photo");
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/profile/photo", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not remove profile photo");
      onPhotoChange(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not remove profile photo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile-modal-backdrop" role="dialog" aria-modal="true" aria-label="Profile settings" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="profile-modal">
        <header>
          <div>
            <span className="eyebrow">Profile</span>
            <h2>Mailbox profile</h2>
          </div>
          <button className="profile-modal-close" type="button" aria-label="Close profile settings" onClick={onClose}>×</button>
        </header>

        <div className="profile-photo-section">
          <div className="profile-photo-preview" aria-hidden="true">
            {photoUrl ? <img src={photoUrl} alt="" /> : <span>LM</span>}
          </div>
          <div className="profile-photo-copy">
            <strong>Profile photo</strong>
            <span>This photo appears in the app header and beside messages you send.</span>
            <div className="profile-photo-actions">
              <button className="profile-photo-primary" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
                <Icon name="compose" size={15} />{busy ? "Working…" : photoUrl ? "Change photo" : "Choose photo"}
              </button>
              {photoUrl ? <button type="button" disabled={busy} onClick={() => void removePhoto()}>Remove</button> : null}
            </div>
          </div>
        </div>

        <input ref={inputRef} className="profile-photo-input" type="file" accept="image/*" onChange={(event) => void uploadPhoto(event)} />
        <div className="profile-modal-note"><Icon name="lock" size={14} /><span>Your profile photo is stored privately in your existing mail storage.</span></div>
      </section>
    </div>
  );
}
