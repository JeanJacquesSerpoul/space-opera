import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { BOT_LEVELS } from '../../shared/bot';
import { CLASSES, CLASS_IDS, SPECIES_IDS, STATS } from '../../shared/data';
import { RENOWN_GOAL } from '../../shared/engine';
import type { MessageKey, T } from '../../shared/i18n';
import { isRoomCode } from '../../shared/online';
import type { ClassId, HeroConfig, PlayerColor } from '../../shared/types';
import { type GameSummary, type LeaderRow, OFFLINE, api } from '../lib/api';
import { errorText, useT } from '../lib/i18n';
import { forgetIdentity, listRooms } from '../lib/online';
import { saveName, savedName } from '../lib/prefs';
import { PLAYER_COLORS, PLAYER_FILL, STAT_ICON } from '../lib/theme';
import { Brand, Starfield } from './Brand';

// ---------------------------------------------------------------- accueil

export function Home({
  onNew,
  onNewRoom,
  onOpen,
  onRoom,
  onIntro,
  onRules,
  onSettings,
}: {
  onNew: () => void;
  onNewRoom: () => void;
  onIntro: () => void;
  onOpen: (id: number) => void;
  onRoom: (code: string) => void;
  onRules: () => void;
  onSettings: () => void;
}) {
  const { t } = useT();
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    api
      .listGames()
      .then(setGames)
      .catch((e) => {
        setGames([]);
        setError(errorText(e, t));
      });
    api
      .stats()
      .then(setLeaders)
      .catch(() => setLeaders([]));
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: chargement initial seulement
  useEffect(refresh, []);

  const remove = async (id: number) => {
    if (!confirm(t('home.deleteConfirm'))) return;
    await api.deleteGame(id);
    refresh();
  };

  return (
    <div className="screen home">
      <Starfield />
      <motion.header className="home-hero" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Brand />
        <p className="tagline">{t('brand.tagline')}</p>
        <div className="home-actions">
          <button type="button" className="btn primary big" onClick={onNew}>
            {t('home.new')}
          </button>
          <button type="button" className="btn" onClick={onIntro}>
            {t('home.intro')}
          </button>
          <button type="button" className="btn" onClick={onRules}>
            {t('home.rules')}
          </button>
          <button type="button" className="btn ghost" onClick={onSettings}>
            ⚙ {t('home.settings')}
          </button>
        </div>
        {OFFLINE && <p className="muted small">{t('home.offline')}</p>}
        {error && <p className="error">{error}</p>}
      </motion.header>

      <div className="home-columns">
        <section className="panel-card">
          <h2>{t('home.saved')}</h2>
          {games?.length === 0 && <p className="muted">{t('home.none')}</p>}
          <ul className="saved-list">
            {games?.map((g) => (
              <li key={g.id} className="saved">
                <button type="button" className="saved-open" onClick={() => (g.room ? onRoom(g.room) : onOpen(g.id))}>
                  <span className="saved-meta">
                    #{g.id} · {g.status === 'finished' ? t('home.finished') : t('home.round', { n: g.round })}
                    {g.room && ` · 🌐 ${t('home.onlineGame', { code: g.room })}`}
                  </span>
                  <span className="saved-players">
                    {g.players.map((p) => (
                      <span
                        key={p.seat}
                        className="chip"
                        style={{ '--c': PLAYER_FILL[p.color as PlayerColor] } as React.CSSProperties}
                      >
                        {CLASSES[p.class_id as ClassId]?.glyph} {p.name}
                        {p.rank === 1 && ' ★'}
                      </span>
                    ))}
                  </span>
                </button>
                <button type="button" className="btn ghost small" onClick={() => remove(g.id)} aria-label={t('home.delete')}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>

        <OnlineRooms onRoom={onRoom} onNewRoom={onNewRoom} />

        <section className="panel-card">
          <h2>{t('home.leaderboard')}</h2>
          {leaders.length === 0 ? (
            <p className="muted">{t('leader.empty')}</p>
          ) : (
            <table className="leaders">
              <thead>
                <tr>
                  <th>{t('leader.name')}</th>
                  <th>{t('leader.games')}</th>
                  <th>{t('leader.wins')}</th>
                  <th>{t('leader.avg')}</th>
                  <th>{t('leader.best')}</th>
                </tr>
              </thead>
              <tbody>
                {leaders.slice(0, 10).map((r) => (
                  <tr key={r.name}>
                    <td>
                      {r.is_bot ? '🤖 ' : ''}
                      {r.name}
                    </td>
                    <td>{r.games}</td>
                    <td>{r.wins}</td>
                    <td>{r.avg_score}</td>
                    <td>{r.best_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Salons en ligne : en créer un, en rejoindre un avec son code,
 * ou revenir dans un salon déjà connu de cet appareil.
 */
function OnlineRooms({ onRoom, onNewRoom }: { onRoom: (code: string) => void; onNewRoom: () => void }) {
  const { t, lang } = useT();
  const [code, setCode] = useState('');
  const [rooms, setRooms] = useState(listRooms);

  const forget = (room: string) => {
    if (!confirm(t('home.forgetConfirm', { code: room }))) return;
    forgetIdentity(room);
    setRooms(listRooms());
  };

  return (
    <section className="panel-card online-rooms">
      <h2>🌐 {t('home.rooms')}</h2>
      <div className="online-rooms-actions">
        <button type="button" className="btn primary" onClick={onNewRoom}>
          {t('home.createRoom')}
        </button>
        <form
          className="join-room"
          onSubmit={(e) => {
            e.preventDefault();
            if (isRoomCode(code)) onRoom(code);
          }}
        >
          <label htmlFor="room-code" className="muted small">
            {t('home.joinHint')}
          </label>
          <div className="join-room-row">
            <input
              id="room-code"
              className="name-input"
              value={code}
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="ABC234"
              aria-label={t('home.joinTitle')}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
            <button type="submit" className="btn" disabled={!isRoomCode(code)}>
              {t('home.join')}
            </button>
          </div>
        </form>
      </div>

      <h3>{t('home.myRooms')}</h3>
      {rooms.length === 0 ? (
        <p className="muted small">{t('home.roomsEmpty')}</p>
      ) : (
        <ul className="saved-list">
          {rooms.map((r) => (
            <li key={r.code} className="saved">
              <button type="button" className="saved-open" onClick={() => onRoom(r.code)}>
                <span className="saved-meta">
                  <b className="room-code small">{r.code}</b> · {new Date(r.at).toLocaleDateString(lang)}
                </span>
                <span className="saved-players">
                  {r.ids.map((id) => (
                    <span key={id.token} className="chip">
                      {id.role === 'host' ? `👑 ${t('home.asHost')}` : t('home.asGuest')}
                      {id.name && ` · ${id.name}`}
                    </span>
                  ))}
                </span>
              </button>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => forget(r.code)}
                aria-label={t('home.forgetRoom', { code: r.code })}
                title={t('home.forgetRoom', { code: r.code })}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- création de l'équipage

const BOT_NAMES = ['Nova', 'Kael', 'Zyra', 'Orik', 'Vesh', 'Lyra', 'Talos', 'Mira'];

function defaultHero(i: number, taken: HeroConfig[], you: string): HeroConfig {
  const color = PLAYER_COLORS.find((c) => !taken.some((h) => h.color === c))!;
  const classId = CLASS_IDS.find((c) => !taken.some((h) => h.classId === c)) ?? CLASS_IDS[i % CLASS_IDS.length];
  const name = i === 0 ? you : (BOT_NAMES.find((n) => !taken.some((h) => h.name === n)) ?? `Héros ${i + 1}`);
  return { name, isBot: i > 0, color, classId, speciesId: SPECIES_IDS[(i * 3) % SPECIES_IDS.length], level: 'normal' };
}

/**
 * En ligne, l'hôte joue le premier héros (avec un vrai nom : « Vous » ne parlerait pas aux invités)
 * et une place est proposée d'office à un ami.
 */
function onlineCrew(heroes: HeroConfig[], t: T): HeroConfig[] {
  const list = heroes.map((h, i) =>
    i === 0 ? { ...h, isBot: false, name: h.name === t('setup.you') ? t('setup.captain') : h.name } : h,
  );
  if (list.slice(1).some((h) => !h.isBot)) return list;
  if (list.length === 1) list.push(defaultHero(1, list, ''));
  list[1] = { ...list[1], isBot: false, name: t('setup.guestName', { n: 2 }) };
  return list;
}

export function Setup({
  onStart,
  onBack,
  onRules,
  initialOnline = false,
}: {
  onStart: (heroes: HeroConfig[], online: boolean) => Promise<void>;
  onBack: () => void;
  onRules: () => void;
  /** Arrivée par « créer un salon » : le mode en ligne est déjà choisi. */
  initialOnline?: boolean;
}) {
  const { t } = useT();
  const [heroes, setHeroes] = useState<HeroConfig[]>(() => {
    const list: HeroConfig[] = [];
    for (let i = 0; i < 3; i++) list.push(defaultHero(i, list, savedName(t('setup.you'))));
    return initialOnline ? onlineCrew(list, t) : list;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(initialOnline);

  const patch = (i: number, p: Partial<HeroConfig>) => setHeroes((hs) => hs.map((h, k) => (k === i ? { ...h, ...p } : h)));

  const chooseMode = (on: boolean) => {
    setOnline(on);
    setError(null);
    if (on) setHeroes((hs) => onlineCrew(hs, t));
  };

  const start = async () => {
    if (online && !heroes.slice(1).some((h) => !h.isBot)) {
      setError(t('setup.onlineNeedsGuest'));
      return;
    }
    setBusy(true);
    setError(null);
    const first = heroes.find((h) => !h.isBot);
    // le nom d'hôte proposé d'office n'est pas retenu pour les parties suivantes
    if (first && first.name !== t('setup.captain')) saveName(first.name.trim());
    try {
      await onStart(heroes, online);
    } catch (e) {
      setError(errorText(e, t));
      setBusy(false);
    }
  };

  const humans = heroes.filter((h) => !h.isBot).length;

  return (
    <div className="screen setup">
      <Starfield />
      <header className="setup-head">
        <button type="button" className="btn ghost" onClick={onBack}>
          ← {t('setup.back')}
        </button>
        <h1>{t('setup.title')}</h1>
        <button type="button" className="btn ghost" onClick={onRules}>
          ?
        </button>
      </header>

      <fieldset className="mode-picker" aria-label={t('setup.mode')}>
        {([false, true] as const).map((on) => (
          <button
            key={String(on)}
            type="button"
            aria-pressed={online === on}
            className={`mode-card ${online === on ? 'on' : ''}`}
            onClick={() => chooseMode(on)}
          >
            <span className="mode-icon" aria-hidden>
              {on ? '🌐' : '📱'}
            </span>
            <b>{on ? t('setup.modeOnline') : t('setup.modeLocal')}</b>
            <small>{on ? t('setup.modeOnlineHint') : t('setup.modeLocalHint')}</small>
          </button>
        ))}
      </fieldset>

      <p className="muted center">
        {online
          ? OFFLINE
            ? t('setup.onlineNotePeer')
            : t('setup.onlineNote')
          : heroes.length === 1
            ? t('setup.solo', { goal: RENOWN_GOAL })
            : humans > 1
              ? t('setup.hotseat')
              : ''}
      </p>

      <div className="hero-grid">
        {heroes.map((h, i) => (
          <motion.article
            key={i}
            className="hero-card"
            style={{ '--c': PLAYER_FILL[h.color] } as React.CSSProperties}
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="hero-card-top">
              <span className="hero-glyph">{CLASSES[h.classId].glyph}</span>
              <input
                className="name-input"
                value={h.name}
                maxLength={20}
                aria-label={t('setup.name')}
                onChange={(e) => patch(i, { name: e.target.value })}
              />
              {heroes.length > 1 && (
                <button
                  type="button"
                  className="btn ghost small"
                  aria-label={t('setup.remove')}
                  onClick={() => setHeroes((hs) => hs.filter((_, k) => k !== i))}
                >
                  ✕
                </button>
              )}
            </div>

            {online && i === 0 ? (
              <span className="host-badge">{t('setup.hostBadge')}</span>
            ) : (
              <div className="seg" role="radiogroup">
                <button
                  type="button"
                  className={!h.isBot ? 'on' : ''}
                  onClick={() =>
                    patch(i, online && h.isBot ? { isBot: false, name: t('setup.guestName', { n: i + 1 }) } : { isBot: false })
                  }
                >
                  {online ? t('setup.guest') : t('setup.human')}
                </button>
                <button type="button" className={h.isBot ? 'on' : ''} onClick={() => patch(i, { isBot: true })}>
                  {t('setup.bot')}
                </button>
              </div>
            )}
            {h.isBot && (
              <div className="seg small" role="radiogroup" aria-label={t('setup.level')}>
                {BOT_LEVELS.map((l) => (
                  <button key={l} type="button" className={h.level === l ? 'on' : ''} onClick={() => patch(i, { level: l })}>
                    {t(`level.${l}` as MessageKey)}
                  </button>
                ))}
              </div>
            )}

            <div className="field">
              <span>{t('setup.class')}</span>
              <div className="class-picker">
                {CLASS_IDS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`class-btn ${h.classId === c ? 'on' : ''}`}
                    title={t(`class.${c}` as MessageKey)}
                    onClick={() => patch(i, { classId: c })}
                  >
                    <span>{CLASSES[c].glyph}</span>
                    <small>{t(`class.${c}` as MessageKey)}</small>
                  </button>
                ))}
              </div>
            </div>
            <p className="power">{t(`power.${h.classId}` as MessageKey)}</p>
            <div className="mini-stats">
              {STATS.map((s) => (
                <span key={s} title={t(`stat.${s}` as MessageKey)}>
                  {STAT_ICON[s]} {CLASSES[h.classId].stats[s]}
                </span>
              ))}
              <span>♥ {CLASSES[h.classId].hp}</span>
            </div>

            <label className="field">
              <span>{t('setup.species')}</span>
              <select value={h.speciesId} onChange={(e) => patch(i, { speciesId: e.target.value as HeroConfig['speciesId'] })}>
                {SPECIES_IDS.map((s) => (
                  <option key={s} value={s}>
                    {t(`species.${s}` as MessageKey)} — {t(`speciesDesc.${s}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>

            <div className="color-picker">
              {PLAYER_COLORS.map((c) => {
                const usedBy = heroes.findIndex((o, k) => k !== i && o.color === c);
                return (
                  <button
                    key={c}
                    type="button"
                    className={`swatch ${h.color === c ? 'on' : ''}`}
                    style={{ background: PLAYER_FILL[c] }}
                    disabled={usedBy >= 0}
                    aria-label={c}
                    onClick={() => patch(i, { color: c })}
                  />
                );
              })}
            </div>
          </motion.article>
        ))}

        {heroes.length < 5 && (
          <button
            type="button"
            className="hero-card add"
            onClick={() => setHeroes((hs) => [...hs, defaultHero(hs.length, hs, savedName(t('setup.you')))])}
          >
            + {t('setup.add')}
          </button>
        )}
      </div>

      {error && <p className="error center">{error}</p>}
      <div className="setup-foot">
        <span className="muted">{t('setup.heroes', { n: heroes.length })}</span>
        <button type="button" className="btn primary big" disabled={busy} onClick={start}>
          {online ? `🌐 ${t('setup.startOnline')}` : `🚀 ${t('setup.start')}`}
        </button>
      </div>
    </div>
  );
}
