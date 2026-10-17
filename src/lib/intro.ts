const SEEN_KEY = 'so.introSeen';

/** La présentation animée a-t-elle déjà été vue sur cet appareil ? */
export function introSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // stockage indisponible : on n'impose pas la vidéo à chaque visite
  }
}

export function markIntroSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* stockage indisponible */
  }
}
