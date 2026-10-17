import { AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';
import type { HeroConfig } from '../shared/types';
import { Game } from './components/Game';
import { RulesDialog } from './components/Rules';
import { Home, Setup } from './components/Screens';
import { SettingsDialog } from './components/Settings';
import { api } from './lib/api';

type Route = { name: 'home' } | { name: 'setup' } | { name: 'game'; id: number };

function parseHash(): Route {
  const m = location.hash.match(/^#\/partie\/(\d+)/);
  if (m) return { name: 'game', id: Number(m[1]) };
  if (location.hash === '#/nouvelle') return { name: 'setup' };
  return { name: 'home' };
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [dialog, setDialog] = useState<'rules' | 'settings' | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (hash: string) => {
    location.hash = hash;
  };

  const start = async (heroes: HeroConfig[]) => {
    const { id } = await api.createGame(heroes);
    go(`#/partie/${id}`);
  };

  const openRules = () => setDialog('rules');
  const openSettings = () => setDialog('settings');

  let screen: React.ReactNode;
  switch (route.name) {
    case 'setup':
      screen = <Setup onStart={start} onBack={() => go('#/')} onRules={openRules} />;
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
          onOpen={(id) => go(`#/partie/${id}`)}
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
      </AnimatePresence>
    </>
  );
}
