"use client";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  Minus,
  Plus,
  Utensils,
  AlertCircle,
  LoaderCircle,
} from "lucide-react";
import type { ReactNode } from "react";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal">
          <div className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {description || "Choose the details below."}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close">
              <X size={20} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Stepper({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="stepper">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        aria-label={`Remove one ${label}`}
      >
        <Minus size={14} />
      </button>
      <span>{value}</span>
      <button
        type="button"
        disabled={disabled || value >= 20}
        onClick={() => onChange(value + 1)}
        aria-label={`Add one ${label}`}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
export function Diet({ veg }: { veg: boolean }) {
  return (
    <span
      className={`diet ${veg ? "veg" : "nonveg"}`}
      title={veg ? "Vegetarian" : "Non-vegetarian"}
      aria-label={veg ? "Vegetarian" : "Non-vegetarian"}
    >
      <i />
    </span>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Utensils size={30} />
      </div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function ErrorNotice({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-notice" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
      {retry && (
        <button className="text-button" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} /> Getting everything ready…
    </div>
  );
}
export function FoodPhoto({
  src,
  name,
  className = "",
  loading = "eager",
}: {
  src: string | null;
  name: string;
  className?: string;
  loading?: "eager" | "lazy";
}) {
  return src ? (
    <img
      className={`food-photo ${className} ${src.includes("salan") ? "photo-contain" : ""}`}
      src={src}
      alt={name}
      loading={loading}
      decoding="async"
      style={{
        objectPosition: src.includes("chicken")
          ? "50% 62%"
          : src.includes("vegetable")
            ? "50% 68%"
            : "center",
      }}
    />
  ) : (
    <div className={`photo-placeholder ${className}`}>
      <Utensils size={28} />
      <span>Photo coming soon</span>
    </div>
  );
}
