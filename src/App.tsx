import { AnimatePresence } from 'motion/react';
import { Suspense, lazy, useEffect, useState } from 'react';
import type { HeroConfig } from '../shared/types';
import { Game } from './components/Game';
import { RoomScreen } from './components/Room';
import { RulesDialog } from './components/Rules';
import { Home, Setup } from './components/Screens';
import { SettingsDialog } from './components/Settings';
import { api } from './lib/api';
import { introSeen } from './lib/intro';
import { createRoom } from './lib/online';

// présentation chargée à la demande (première visite ou bouton de l'accueil)
const IntroVideo = lazy(() => import('./components/IntroVideo').then((m) => ({ default: m.IntroVideo })));

type Route =
  | { name: 'home' }
  | { name: 'setup'; online?: boolean }
  | { name: 'game'; id: number }
  | { name: 'room'; code: string };

function parseHash(): Route {
  const m = location.hash.match(/^#\/partie\/(\d+)/);
  if (m) return { name: 'game', id: Number(m[1]) };
  const room = location.hash.match(/^#\/salon\/([A-Za-z0-9]{6})/);
  if (room) return { name: 'room', code: room[1].toUpperCase() };
  if (location.hash === '#/nouvelle') return { name: 'setup' };
  if (location.hash === '#/nouveau-salon') return { name: 'setup', online: true };
  return { name: 'home' };
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [dialog, setDialog] = useState<'rules' | 'settings' | null>(null);
  // présentation animée à la toute première ouverture (sauf arrivée par un lien d'invitation)
  const [showIntro, setShowIntro] = useState(() => !introSeen() && parseHash().name !== 'room');

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (hash: string) => {
    location.hash = hash;
  };

  const start = async (heroes: HeroConfig[], online: boolean) => {
    if (online) return go(`#/salon/${await createRoom(heroes)}`);
    const { id } = await api.createGame(heroes);
    go(`#/partie/${id}`);
  };

  const openRules = () => setDialog('rules');
  const openSettings = () => setDialog('settings');

  let screen: React.ReactNode;
  switch (route.name) {
    case 'setup':
      screen = (
        <Setup
          key={String(route.online)}
          initialOnline={route.online}
          onStart={start}
          onBack={() => go('#/')}
          onRules={openRules}
        />
      );
      break;
    case 'room':
      screen = (
        <RoomScreen
          key={route.code}
          code={route.code}
          onExit={() => go('#/')}
          onNewGame={() => go('#/nouvelle')}
          onRules={openRules}
          onSettings={openSettings}
        />
      );
      break;
    case 'game':
      screen = (
        <Game
          key={route.id}
          id={route.id}
          onExit={() => go('#/')}
          onNewGame={() => go('#/nouvelle')}
          onRules={openRules}
          onSettings={openSettings}
        />
      );
      break;
    default:
      screen = (
        <Home
          onNew={() => go('#/nouvelle')}
          onNewRoom={() => go('#/nouveau-salon')}
          onIntro={() => setShowIntro(true)}
          onOpen={(id) => go(`#/partie/${id}`)}
          onRoom={(code) => go(`#/salon/${code}`)}
          onRules={openRules}
          onSettings={openSettings}
        />
      );
  }

  return (
    <>
      {screen}
      <AnimatePresence>
        {dialog === 'rules' && <RulesDialog key="rules" onClose={() => setDialog(null)} />}
        {dialog === 'settings' && <SettingsDialog key="settings" onClose={() => setDialog(null)} />}
        {showIntro && (
          <Suspense key="intro" fallback={null}>
            <IntroVideo onClose={() => setShowIntro(false)} />
          </Suspense>
        )}
      </AnimatePresence>
    </>
  );
}
