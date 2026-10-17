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
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /Confier à l’ordinateur/ }).click();

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
  page.once('dialog', (d) => d.accept());
  await rooms.getByRole('button', { name: `Oublier le salon ${code}` }).click();
  await expect(rooms.getByText(code)).toHaveCount(0);
});
