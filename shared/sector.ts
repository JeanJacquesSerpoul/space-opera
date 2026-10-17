import type { Lane, StarSystem } from './types';

/**
 * Le Secteur de la Couronne : 26 systèmes reliés par des couloirs hyperspatiaux.
 * Coordonnées dans un plan de 1000 × 650.
 */

export const SECTOR_W = 1000;
export const SECTOR_H = 650;
/** Station de départ (et point de retour des héros mis hors de combat). */
export const HOME = 'nexus';

const sys = (
  id: string,
  fr: string,
  en: string,
  kind: StarSystem['kind'],
  x: number,
  y: number,
  label: StarSystem['label'] = 's',
) => ({
  id,
  name: { fr, en },
  kind,
  x,
  y,
  label,
});

export const SYSTEMS: StarSystem[] = [
  sys('glacia', 'Glacia', 'Glacia', 'planet', 230, 90, 'n'),
  sys('shroud', 'Le Linceul', 'The Shroud', 'nebula', 390, 60, 'n'),
  sys('kepler', 'Kepler-Noir', 'Black Kepler', 'planet', 540, 80, 'n'),
  sys('hydra', 'Hydra Prime', 'Hydra Prime', 'planet', 700, 90, 'n'),
  sys('ark', 'Arche silencieuse', 'Silent Ark', 'derelict', 900, 70, 's'),
  sys('pyros', 'Pyros', 'Pyros', 'planet', 80, 190, 'n'),
  sys('aurelia', 'Aurélia', 'Aurelia', 'planet', 330, 200, 'w'),
  sys('veil', "Voile d'Opale", 'Opal Veil', 'nebula', 460, 210, 'e'),
  sys('thalassa', 'Thalassa', 'Thalassa', 'planet', 620, 200, 'e'),
  sys('azur', "Citadelle d'Azur", 'Azure Citadel', 'station', 800, 190, 'e'),
  sys('dune', 'Sirocco', 'Sirocco', 'planet', 150, 320, 'w'),
  sys('wreck', "Épave de l'Infatigable", 'Wreck of the Tireless', 'derelict', 270, 330, 's'),
  sys('nexus', 'Nexus', 'Nexus', 'station', 480, 330, 's'),
  sys('orchis', 'Orchis', 'Orchis', 'planet', 680, 330, 's'),
  sys('tycho', 'Tycho-7', 'Tycho-7', 'planet', 890, 300, 'e'),
  sys('forge', 'Forge abandonnée', 'Derelict Forge', 'derelict', 55, 460, 'n'),
  sys('ferraille', 'Port-Ferraille', 'Scrapport', 'station', 200, 450, 's'),
  sys('ferrum', 'Ferrum', 'Ferrum', 'planet', 350, 440, 's'),
  sys('vespera', 'Vespéra', 'Vespera', 'planet', 580, 450, 'e'),
  sys('solace', 'Solace', 'Solace', 'planet', 770, 440, 's'),
  sys('zenith', 'Zénith', 'Zenith', 'planet', 930, 430, 'n'),
  sys('mist', 'Brumes de Kor', 'Kor Mists', 'nebula', 90, 590, 's'),
  sys('ulmo', 'Ulmo', 'Ulmo', 'planet', 260, 580, 's'),
  sys('marath', 'Marath', 'Marath', 'planet', 420, 570, 's'),
  sys('graveyard', 'Cimetière de vaisseaux', 'Ship Graveyard', 'derelict', 600, 580, 's'),
  sys('maw', 'La Gueule', 'The Maw', 'nebula', 860, 580, 's'),
];

const lane = (a: string, b: string): Lane => ({ a, b });

export const LANES: Lane[] = [
  lane('glacia', 'shroud'),
  lane('shroud', 'kepler'),
  lane('kepler', 'hydra'),
  lane('hydra', 'ark'),
  lane('glacia', 'pyros'),
  lane('glacia', 'aurelia'),
  lane('shroud', 'aurelia'),
  lane('kepler', 'veil'),
  lane('kepler', 'thalassa'),
  lane('hydra', 'thalassa'),
  lane('hydra', 'azur'),
  lane('ark', 'azur'),
  lane('aurelia', 'veil'),
  lane('veil', 'thalassa'),
  lane('thalassa', 'azur'),
  lane('pyros', 'dune'),
  lane('aurelia', 'wreck'),
  lane('aurelia', 'nexus'),
  lane('veil', 'nexus'),
  lane('thalassa', 'nexus'),
  lane('thalassa', 'orchis'),
  lane('azur', 'orchis'),
  lane('azur', 'tycho'),
  lane('dune', 'wreck'),
  lane('wreck', 'nexus'),
  lane('nexus', 'orchis'),
  lane('orchis', 'tycho'),
  lane('dune', 'forge'),
  lane('dune', 'ferraille'),
  lane('wreck', 'ferraille'),
  lane('wreck', 'ferrum'),
  lane('nexus', 'ferrum'),
  lane('nexus', 'vespera'),
  lane('orchis', 'vespera'),
  lane('orchis', 'solace'),
  lane('tycho', 'zenith'),
  lane('tycho', 'solace'),
  lane('forge', 'ferraille'),
  lane('ferraille', 'ferrum'),
  lane('vespera', 'solace'),
  lane('solace', 'zenith'),
  lane('forge', 'mist'),
  lane('ferraille', 'mist'),
  lane('ferraille', 'ulmo'),
  lane('ferrum', 'ulmo'),
  lane('ferrum', 'marath'),
  lane('vespera', 'marath'),
  lane('vespera', 'graveyard'),
  lane('solace', 'graveyard'),
  lane('solace', 'maw'),
  lane('zenith', 'maw'),
  lane('mist', 'ulmo'),
  lane('ulmo', 'marath'),
  lane('marath', 'graveyard'),
  lane('graveyard', 'maw'),
];

export const SYSTEM_BY_ID: Record<string, StarSystem> = Object.fromEntries(SYSTEMS.map((s) => [s.id, s]));

/** Voisins de chaque système. */
export const NEIGHBORS: Record<string, string[]> = Object.fromEntries(SYSTEMS.map((s) => [s.id, [] as string[]]));
for (const l of LANES) {
  NEIGHBORS[l.a].push(l.b);
  NEIGHBORS[l.b].push(l.a);
}
