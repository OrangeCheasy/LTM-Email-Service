import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";

type ProfileModalProps = {
  open: boolean;
  photoUrl: string | null;
  onClose: () => void;
  onPhotoChange: (url: string | null) => void;
};

type CropSource = {
  url: string;
  image: HTMLImageElement;
  width: number;
  height: number;
};

type Point = { x: number; y: number };

const CROP_SIZE = 260;
const MAX_ZOOM = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cropMetrics(source: CropSource, zoom: number) {
  const baseScale = Math.max(CROP_SIZE / source.width, CROP_SIZE / source.height);
  const scale = baseScale * zoom;
  const displayedWidth = source.width * scale;
  const displayedHeight = source.height * scale;
  return {
    scale,
    displayedWidth,
    displayedHeight,
    maxX: Math.max(0, (displayedWidth - CROP_SIZE) / 2),
    maxY: Math.max(0, (displayedHeight - CROP_SIZE) / 2),
  };
}

async function loadCropSource(file: File): Promise<CropSource> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("That image could not be opened"));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("That image could not be opened");
    return { url, image, width: image.naturalWidth, height: image.naturalHeight };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function renderCroppedPhoto(source: CropSource, zoom: number, offset: Point): Promise<Blob> {
  const metrics = cropMetrics(source, zoom);
  const boundedX = clamp(offset.x, -metrics.maxX, metrics.maxX);
  const boundedY = clamp(offset.y, -metrics.maxY, metrics.maxY);
  const left = (CROP_SIZE - metrics.displayedWidth) / 2 + boundedX;
  const top = (CROP_SIZE - metrics.displayedHeight) / 2 + boundedY;
  const sx = Math.max(0, -left / metrics.scale);
  const sy = Math.max(0, -top / metrics.scale);
  const sw = Math.min(source.width - sx, CROP_SIZE / metrics.scale);
  const sh = Math.min(source.height - sy, CROP_SIZE / metrics.scale);

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Photo processing is unavailable");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source.image, sx, sy, sw, sh, 0, 0, 512, 512);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("Photo processing failed");
  return blob;
}

export function ProfileModal({ open, photoUrl, onClose, onPhotoChange }: ProfileModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; origin: Point }>({
    active: false,
    startX: 0,
    startY: 0,
    origin: { x: 0, y: 0 },
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<CropSource | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });

  useEffect(() => {
    return () => {
      if (cropSource) URL.revokeObjectURL(cropSource.url);
    };
  }, [cropSource]);

  const metrics = useMemo(() => cropSource ? cropMetrics(cropSource, zoom) : null, [cropSource, zoom]);
  const boundedOffset = useMemo(() => {
    if (!metrics) return offset;
    return {
      x: clamp(offset.x, -metrics.maxX, metrics.maxX),
      y: clamp(offset.y, -metrics.maxY, metrics.maxY),
    };
  }, [metrics, offset]);

  if (!open) return null;

  const announcePhotoChange = (url: string | null) => {
    onPhotoChange(url);
    window.dispatchEvent(new CustomEvent("profile-photo-changed", { detail: url }));
  };

  const choosePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const nextSource = await loadCropSource(file);
      setCropSource(nextSource);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "That image could not be opened");
    } finally {
      setBusy(false);
    }
  };

  const saveCrop = async () => {
    if (!cropSource) return;
    setBusy(true);
    setError(null);
    try {
      const normalized = await renderCroppedPhoto(cropSource, zoom, boundedOffset);
      const form = new FormData();
      form.append("photo", new File([normalized], "profile.jpg", { type: "image/jpeg" }));
      const response = await fetch("/api/profile/photo", { method: "PUT", body: form });
      const data = await response.json().catch(() => ({})) as { error?: string; version?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save profile photo");
      announcePhotoChange(`/api/profile/photo?v=${encodeURIComponent(data.version ?? String(Date.now()))}`);
      setCropSource(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not save profile photo");
    } finally {
      setBusy(false);
    }
  };

  const cancelCrop = () => {
    setCropSource(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError(null);
  };

  const resetCrop = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const changeZoom = (nextZoom: number) => {
    if (!cropSource) return;
    const next = clamp(nextZoom, 1, MAX_ZOOM);
    const nextMetrics = cropMetrics(cropSource, next);
    setZoom(next);
    setOffset((current) => ({
      x: clamp(current.x, -nextMetrics.maxX, nextMetrics.maxX),
      y: clamp(current.y, -nextMetrics.maxY, nextMetrics.maxY),
    }));
  };

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!cropSource || busy) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      origin: boundedOffset,
    };
  };

  const dragPhoto = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || !metrics) return;
    const nextX = dragRef.current.origin.x + event.clientX - dragRef.current.startX;
    const nextY = dragRef.current.origin.y + event.clientY - dragRef.current.startY;
    setOffset({
      x: clamp(nextX, -metrics.maxX, metrics.maxX),
      y: clamp(nextY, -metrics.maxY, metrics.maxY),
    });
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const removePhoto = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/profile/photo", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not remove profile photo");
      announcePhotoChange(null);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove profile photo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile-modal-backdrop" role="dialog" aria-modal="true" aria-label="Profile settings" onMouseDown={(event) => {
      if (event.currentTarget === event.target && !cropSource) onClose();
    }}>
      <section className={`profile-modal ${cropSource ? "profile-modal-cropping" : ""}`}>
        <header>
          <div>
            <span className="eyebrow">Profile</span>
            <h2>{cropSource ? "Adjust profile photo" : "Mailbox profile"}</h2>
          </div>
          <button className="profile-modal-close" type="button" aria-label={cropSource ? "Cancel photo adjustment" : "Close profile settings"} onClick={cropSource ? cancelCrop : onClose}>×</button>
        </header>

        {cropSource && metrics ? (
          <div className="profile-crop-editor">
            <div
              className="profile-crop-stage"
              onPointerDown={beginDrag}
              onPointerMove={dragPhoto}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              aria-label="Drag photo to reposition"
            >
              <img
                src={cropSource.url}
                alt="Profile crop preview"
                draggable={false}
                style={{
                  width: `${metrics.displayedWidth}px`,
                  height: `${metrics.displayedHeight}px`,
                  transform: `translate(calc(-50% + ${boundedOffset.x}px), calc(-50% + ${boundedOffset.y}px))`,
                }}
              />
              <div className="profile-crop-ring" aria-hidden="true" />
            </div>

            <div className="profile-crop-help">Drag to reposition your photo inside the frame.</div>

            <div className="profile-crop-controls">
              <div className="profile-crop-zoom-row">
                <span>Scale</span>
                <input
                  aria-label="Profile photo scale"
                  type="range"
                  min="1"
                  max={String(MAX_ZOOM)}
                  step="0.01"
                  value={zoom}
                  onChange={(event) => changeZoom(Number(event.target.value))}
                />
                <strong>{Math.round(zoom * 100)}%</strong>
              </div>
              <button type="button" disabled={busy} onClick={resetCrop}>Reset</button>
            </div>

            <div className="profile-crop-actions">
              <button type="button" disabled={busy} onClick={cancelCrop}>Cancel</button>
              <button className="profile-photo-primary" type="button" disabled={busy} onClick={() => void saveCrop()}>
                {busy ? "Saving…" : "Save photo"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="profile-photo-section">
              <div className="profile-photo-preview" aria-hidden="true">
                {photoUrl ? <img src={photoUrl} alt="" /> : <span>LM</span>}
              </div>
              <div className="profile-photo-copy">
                <strong>Profile photo</strong>
                <span>This photo appears in the app header and beside messages you send inside LTM Mails.</span>
                <div className="profile-photo-actions">
                  <button className="profile-photo-primary" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
                    <Icon name="compose" size={15} />{busy ? "Working…" : photoUrl ? "Change photo" : "Choose photo"}
                  </button>
                  {photoUrl ? <button type="button" disabled={busy} onClick={() => void removePhoto()}>Remove</button> : null}
                </div>
              </div>
            </div>

            <div className="profile-outbound-note">
              <Icon name="send" size={14} />
              <span>Your photo is used for outbound messages inside LTM Mails. External email apps choose their own sender avatar and may not display this photo.</span>
            </div>
          </>
        )}

        <input ref={inputRef} className="profile-photo-input" type="file" accept="image/*" onChange={(event) => void choosePhoto(event)} />
        {error ? <div className="profile-modal-error" role="alert">{error}</div> : null}
        {!cropSource ? <div className="profile-modal-note"><Icon name="lock" size={14} /><span>Your profile photo is stored privately in your existing mail storage.</span></div> : null}
      </section>
    </div>
  );
}
