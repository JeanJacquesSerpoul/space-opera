import { expect, test } from '@playwright/test';

// Version hors ligne (moteur dans le navigateur) : voir playwright.config.ts.

// la présentation animée de la première visite est testée à part (intro.spec.ts)
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('so.introSeen', '1'));
});

test('lance une partie, saute vers un système et joue un tour contre les ordinateurs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Space Opera' })).toBeVisible();
  await page.getByRole('button', { name: 'Nouvelle partie' }).click();

  await expect(page.getByRole('heading', { name: 'Constituez votre équipage' })).toBeVisible();
  await page.getByRole('button', { name: /Décoller/ }).click();

  await expect(page.getByText('Au tour de Vous')).toBeVisible();
  await expect(page.getByText(/Vous êtes à Nexus/)).toBeVisible();

  // saut vers un système accessible
  const target = page.locator('.system.reachable').first();
  const id = await target.getAttribute('data-system');
  await target.dispatchEvent('click');
  await expect(page.getByText(/Vous êtes à Nexus/)).toBeHidden();
  expect(id).toBeTruthy();

  // fin du tour : les ordinateurs jouent, puis la main revient au joueur
  await page.getByRole('button', { name: /Finir le tour/ }).click();
  await expect(page.getByText(/réfléchit/)).toBeVisible();
  await expect(page.getByText('Au tour de Vous')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Tour 2')).toBeVisible();
});

test('affiche les règles et change de langue', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Règles du jeu' }).click();
  await expect(page.getByRole('heading', { name: 'But du jeu' })).toBeVisible();
  await page.getByRole('button', { name: 'Compris !' }).click();

  await page.getByRole('button', { name: /Réglages/ }).click();
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByRole('button', { name: 'Close' }).last().click();
  await expect(page.getByRole('button', { name: 'New game' })).toBeVisible();
});

test('reprend une partie sauvegardée depuis l’accueil', async ({ page }) => {
  await page.goto('/#/nouvelle');
  await page.getByRole('button', { name: /Décoller/ }).click();
  await expect(page.getByText('Au tour de Vous')).toBeVisible();
  await page.getByRole('button', { name: 'Quitter' }).click();
  await expect(page.getByText(/Tour 1/)).toBeVisible();
  await page.locator('.saved-open').first().click();
  await expect(page.getByText('Au tour de Vous')).toBeVisible();
});

test('ouvre un salon en ligne et affiche son code d’invitation', async ({ page }) => {
  await page.goto('/#/nouvelle');
  await page.getByRole('button', { name: /En ligne/ }).click();
  await expect(page.getByText('👑 Vous (hôte)')).toBeVisible();
  await page.getByRole('button', { name: /Ouvrir le salon/ }).click();

  // hors ligne, la partie tourne chez l'hôte : il joue tout de suite, l'invité est attendu
  await expect(page).toHaveURL(/#\/salon\/[A-Z2-9]{6}$/);
  await expect(page.getByText('Au tour de Capitaine')).toBeVisible();
  await page.getByRole('button', { name: 'Salon' }).click();
  const code = page.url().slice(-6);
  await expect(page.getByRole('dialog', { name: 'Salon' }).getByText(code, { exact: true })).toBeVisible();
  await expect(page.getByText('En attente d’un joueur')).toBeVisible();
});

test('confie à l’ordinateur la place d’un invité qui ne vient pas', async ({ page }) => {
  await page.goto('/#/nouveau-salon');
  await page.getByRole('button', { name: /Ouvrir le salon/ }).click();
  await expect(page.getByText('Au tour de Capitaine')).toBeVisible();

  // l'hôte passe la main : la partie attend l'invité, qui n'est jamais venu
  await page.getByRole('button', { name: /Finir le tour/ }).click();
  await expect(page.getByText('En attente de Invité 2 (place libre)')).toBeVisible();
  await page.getByRole('button', { name: /Confier à l’ordinateur/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmer' }).click();

  // l'ordinateur joue cette place (et l'autre ordinateur), puis la main revient à l'hôte
  await expect(page.getByText('Tour 2')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Au tour de Capitaine')).toBeVisible();
  await page.getByRole('button', { name: 'Salon' }).click();
  await expect(page.getByText('En attente d’un joueur')).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Salon' }).getByText('Ordinateur')).toHaveCount(2);
});

test('retrouve un salon de l’appareil depuis l’accueil', async ({ page }) => {
  await page.goto('/#/nouveau-salon');
  await page.getByRole('button', { name: /Ouvrir le salon/ }).click();
  await expect(page).toHaveURL(/#\/salon\/[A-Z2-9]{6}$/);
  const code = page.url().slice(-6);
  await page.getByRole('button', { name: 'Quitter' }).click();

  const rooms = page.locator('.online-rooms');
  await expect(rooms.getByText(code)).toBeVisible();
  await expect(rooms.getByText('👑 Hôte · Capitaine')).toBeVisible();
  await rooms.getByText(code).click();
  await expect(page.getByText('Au tour de Capitaine')).toBeVisible();

  // oublier le salon le retire de la liste
  await page.getByRole('button', { name: 'Quitter' }).click();
  await rooms.getByRole('button', { name: `Oublier le salon ${code}` }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Oublier' }).click();
  await expect(rooms.getByText(code)).toHaveCount(0);
});

test('demande confirmation, au style du jeu, avant de supprimer une partie', async ({ page }) => {
  await page.goto('/#/nouvelle');
  await page.getByRole('button', { name: /Décoller/ }).click();
  await expect(page.getByText('Au tour de Vous')).toBeVisible();
  await page.getByRole('button', { name: 'Quitter' }).click();

  const remove = page.getByRole('button', { name: 'Supprimer' });
  await remove.click();
  const confirm = page.getByRole('alertdialog', { name: 'Supprimer cette partie ?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Annuler' }).click();
  await expect(confirm).toBeHidden();
  await expect(page.locator('.saved-open')).toHaveCount(1);

  await remove.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByText('Aucune partie pour l’instant.')).toBeVisible();
});

test('accompagne une partie guidée pas à pas', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Partie guidée/ }).click();
  const coach = page.locator('.coach');
  await expect(coach.getByText('Sautez vers un système')).toBeVisible();

  // l'étape se valide toute seule quand le joueur saute
  await page.locator('.system.reachable').first().dispatchEvent('click');
  await expect(coach.getByText('Choisissez une action')).toBeVisible();
  await page.getByRole('button', { name: /Finir le tour/ }).click();
  await expect(coach.getByText('Le jet de d20')).toBeVisible();
  for (let i = 0; i < 4; i++) await coach.getByRole('button', { name: 'Suivant' }).click();
  await expect(coach.getByText('Bon voyage, éclaireur !')).toBeVisible();
  await coach.getByRole('button', { name: 'À moi de jouer !' }).click();
  await expect(coach).toHaveCount(0);
});

test('ouvre la fiche d’un joueur depuis le Panthéon', async ({ page }) => {
  // une partie terminée, gardée dans le navigateur
  await page.addInitScript(() => {
    const state = {
      phase: 'finished',
      round: 12,
      players: [{ name: 'Ada', isBot: false, color: 'cyan', classId: 'agent', speciesId: 'android', kos: 1 }],
      results: [{ seat: 0, renown: 40, creditPoints: 2, missions: 7, legendBonus: 5, total: 47, rank: 1 }],
      events: [],
      eventSeq: 0,
    };
    const at = '2026-10-01 11:00:00';
    localStorage.setItem('so.games.v1', JSON.stringify({ nextId: 2, games: { 1: { state, created_at: at, updated_at: at } } }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Ada', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Fiche de Ada' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('47').first()).toBeVisible();
  await expect(sheet.getByText('Agent').first()).toBeVisible();
  await expect(sheet.getByText('missions réussies')).toBeVisible();
});

test('sur téléphone, range le panneau de jeu dans un tiroir à onglets', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'disposition propre au téléphone');
  await page.goto('/#/nouvelle');
  await page.getByRole('button', { name: /Décoller/ }).click();
  const finish = page.getByRole('button', { name: /Finir le tour/ });
  await expect(page.getByRole('tab', { name: /Actions/ })).toHaveAttribute('aria-selected', 'true');
  await expect(finish).toBeVisible();
  await finish.click();
  // pendant le tour des ordinateurs, l'onglet Actions dit où apparaîtront les actions
  await expect(page.getByText('Vos actions apparaîtront ici à votre tour.')).toBeVisible();

  await page.getByRole('tab', { name: 'Héros' }).click();
  await expect(page.locator('.side-pane[data-pane="hero"] .sheet')).toBeVisible();
  await page.getByRole('tab', { name: 'Journal' }).click();
  await expect(page.locator('.side-pane[data-pane="log"] li').first()).toBeVisible();
  await expect(page.locator('.side-pane[data-pane="hero"] .sheet')).toBeHidden();

  // à mon tour, le tiroir revient de lui-même sur les actions
  await expect(finish).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('tab', { name: /Actions/ })).toHaveAttribute('aria-selected', 'true');
});

test('vit sur une planète : activités propres et avant-poste', async ({ page }) => {
  await page.goto('/#/nouvelle');
  await page.getByRole('button', { name: /Décoller/ }).click();
  await expect(page.getByText('Au tour de Vous')).toBeVisible();

  // Thalassa, voisine du Nexus : un océan, ses deux activités et une planète libre
  await page.locator('.system[data-system="thalassa"]').dispatchEvent('click');
  const world = page.locator('.actions .world');
  await expect(world.getByText('🌊 Océan')).toBeVisible();
  await expect(world.getByText('Pêche aux perles')).toBeVisible();
  await expect(world.getByText('Plongée dans les abysses')).toBeVisible();
  await expect(world.getByText('Aucun avant-poste : la planète est libre.')).toBeVisible();

  // fonder ne termine pas le tour ; l'avant-poste apparaît sur la carte et dans l'équipage
  await world.getByRole('button', { name: /Fonder un avant-poste/ }).click();
  await expect(world.getByText('Avant-poste de Vous · niveau 1')).toBeVisible();
  await expect(page.locator('.outpost')).toHaveCount(1);
  await expect(page.getByText('Au tour de Vous')).toBeVisible();
  // plus assez de crédits pour l'améliorer tout de suite
  await expect(world.getByRole('button', { name: /Améliorer l’avant-poste/ })).toBeDisabled();
  await expect(world.getByRole('button', { name: /Tenter/ }).first()).toBeEnabled();
});
