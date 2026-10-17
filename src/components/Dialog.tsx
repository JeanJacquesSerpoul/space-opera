import { motion } from 'motion/react';
import { type ReactNode, useRef } from 'react';
import { useFocusTrap } from '../lib/useFocusTrap';

/** Fenêtre modale animée : Échap ou un clic sur le fond la ferme ; le focus clavier y reste. */
export function Dialog({
  title,
  onClose,
  children,
  className = '',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onClose);

  return (
    <motion.div className="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        ref={ref}
        className={`dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialog-head">
          <h2>{title}</h2>
          <button type="button" className="btn ghost small" onClick={onClose} aria-label="✕">
            ✕
          </button>
        </header>
        <div className="dialog-body">{children}</div>
      </motion.div>
    </motion.div>
  );
}
