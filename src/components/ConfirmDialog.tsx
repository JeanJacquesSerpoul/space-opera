import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../lib/i18n';
import { useFocusTrap } from '../lib/useFocusTrap';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  icon?: string;
  confirmLabel?: string;
  /** Simple message (un seul bouton), en remplacement de window.alert. */
  notice?: boolean;
  /** Action risquée (suppression…) : bouton de confirmation en rouge. */
  danger?: boolean;
}

/** Boîte de confirmation aux couleurs du jeu, en remplacement de window.confirm. */
export function ConfirmDialog({
  title,
  message,
  icon = '🛰',
  confirmLabel,
  notice,
  danger,
  onConfirm,
  onCancel,
}: ConfirmOptions & { onConfirm: () => void; onCancel: () => void }) {
  const { t } = useT();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // focus sur « Annuler » : une validation accidentelle au clavier ne supprime rien
    (notice ? okRef : cancelRef).current?.focus();
  }, [notice]);
  useFocusTrap(dialogRef, onCancel);

  return (
    <motion.div
      className="backdrop confirm-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.div
        ref={dialogRef}
        className="dialog confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={message ? 'confirm-message' : undefined}
        initial={{ scale: 0.85, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-icon" aria-hidden>
          {icon}
        </div>
        <h2 id="confirm-title">{title}</h2>
        {message && (
          <p id="confirm-message" className="muted">
            {message}
          </p>
        )}
        <div className="confirm-actions">
          {!notice && (
            <button ref={cancelRef} type="button" className="btn" onClick={onCancel}>
              {t('common.cancel')}
            </button>
          )}
          <button ref={okRef} type="button" className={`btn primary ${danger ? 'danger' : ''}`} onClick={onConfirm}>
            {confirmLabel ?? (notice ? t('common.ok') : t('common.confirm'))}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Demande une confirmation sans quitter le composant : `await ask({...})` vaut vrai si le joueur confirme.
 * L'élément renvoyé est à placer dans le rendu (il s'affiche par-dessus tout l'écran).
 */
export function useConfirm(): [ReactNode, (options: ConfirmOptions) => Promise<boolean>] {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const ask = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );
  const answer = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };
  const element = createPortal(
    <AnimatePresence>
      {pending && <ConfirmDialog key="confirm" {...pending} onConfirm={() => answer(true)} onCancel={() => answer(false)} />}
    </AnimatePresence>,
    document.body,
  );
  return [element, ask];
}
