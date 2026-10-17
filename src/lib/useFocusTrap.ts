import { type RefObject, useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Garde le focus clavier dans une fenêtre modale : Tab boucle sur ses éléments,
 * Échap la ferme (si `onEscape` est fourni), et le focus revient à l'élément
 * d'origine à la fermeture.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, onEscape?: () => void) {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);

    if (!root.contains(document.activeElement)) (focusables()[0] ?? root).focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      // fenêtres empilées : seule celle qui a le focus réagit
      const mine = root.contains(document.activeElement) || document.activeElement === document.body;
      if (!mine) return;
      if (e.key === 'Escape' && escapeRef.current) {
        e.preventDefault();
        escapeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [ref]);
}
