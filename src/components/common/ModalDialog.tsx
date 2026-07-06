import { useEffect, useRef, type ReactNode } from "react";

interface ModalDialogProps {
  readonly title: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export function ModalDialog({ title, open, onClose, children }: ModalDialogProps) {
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    returnFocusTo.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      returnFocusTo.current?.focus();
      returnFocusTo.current = null;
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        ref={dialog}
        className="window dialog-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <header className="title-bar">
          <h2 id="dialog-title">{title}</h2>
          <button
            ref={closeButton}
            className="title-button"
            type="button"
            aria-label={`Close ${title}`}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="dialog-content">{children}</div>
        <footer className="dialog-actions">
          <button type="button" onClick={onClose}>
            OK
          </button>
        </footer>
      </section>
    </div>
  );
}
