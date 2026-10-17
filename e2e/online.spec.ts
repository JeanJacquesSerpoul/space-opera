import { expect, test } from '@playwright/test';

// Partie en ligne via le serveur (projet « online » de playwright.config.ts) :
// deux contextes de navigateur, donc deux joueurs avec chacun leur stockage local.

// la présentation animée de la première visite est testée à part (intro.spec.ts)
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('so.introSeen', '1'));
});

test('deux joueurs partagent un salon, puis l’ordinateur joue côté serveur', async ({ page: host, browser }) => {
  await host.goto('/#/nouvelle');
  await host.getByRole('button', { name: /En ligne/ }).click();
  await host.getByRole('button', { name: /Ouvrir le salon/ }).click();
  await expect(host).toHaveURL(/#\/salon\/[A-Z2-9]{6}$/);
  const code = host.url().slice(-6);
  // l'invité n'a pas encore pris sa place : la partie attend
  await expect(host.getByRole('button', { name: 'Salon' })).toContainText('1/2');

  const guestContext = await browser.newContext({ locale: 'fr-FR' });
  const guest = await guestContext.newPage();
  await guest.goto(`/#/salon/${code}`);
  await expect(guest.getByRole('heading', { name: 'Rejoindre l’équipage' })).toBeVisible();
  await guest.getByLabel('Votre nom').fill('Zoé');
  // l'invité choisit la classe et l'espèce de son héros
  await guest.getByRole('button', { name: '◈ Agent' }).click();
  await guest.getByRole('combobox').selectOption('android');
  await guest.getByRole('button', { name: 'Prendre ce héros' }).click();

  await expect(host.getByRole('button', { name: 'Salon' })).toContainText('2/2');
  await expect(host.getByText('Au tour de Capitaine')).toBeVisible();
  await expect(guest.getByText('Capitaine joue…')).toBeVisible();

  // l'hôte passe la main à l'invité
  await host.getByRole('button', { name: /Finir le tour/ }).click();
  await expect(guest.getByText('Au tour de Zoé')).toBeVisible();
  await expect(host.getByText('Zoé joue…')).toBeVisible();
  await expect(host.getByText(/Agent · Androïde/)).toBeVisible();

  // l'invité finit à son tour : le serveur fait jouer l'ordinateur, puis la main revient à l'hôte
  await guest.getByRole('button', { name: /Finir le tour/ }).click();
  await expect(host.getByText('Tour 2')).toBeVisible({ timeout: 30_000 });
  await expect(host.getByText('Au tour de Capitaine')).toBeVisible();
  await expect(guest.getByText('Tour 2')).toBeVisible();

  await guestContext.close();
});

test('l’hôte confie à l’ordinateur la place d’un invité parti', async ({ page: host, browser }) => {
  await host.goto('/#/nouveau-salon');
  await host.getByRole('button', { name: /Ouvrir le salon/ }).click();
  await expect(host).toHaveURL(/#\/salon\/[A-Z2-9]{6}$/);
  const code = host.url().slice(-6);

  const guestContext = await browser.newContext({ locale: 'fr-FR' });
  const guest = await guestContext.newPage();
  await guest.goto(`/#/salon/${code}`);
  await guest.getByLabel('Votre nom').fill('Zoé');
  await guest.getByRole('button', { name: 'Prendre ce héros' }).click();
  await expect(host.getByRole('button', { name: 'Salon' })).toContainText('2/2');

  // un invité connecté garde sa place : pas de bouton pour la lui retirer
  await host.getByRole('button', { name: /Finir le tour/ }).click();
  await expect(host.getByText('Zoé joue…')).toBeVisible();
  await expect(host.getByRole('button', { name: /Confier à l’ordinateur/ })).toHaveCount(0);

  // l'invité s'en va en plein tour : l'hôte confie sa place à l'ordinateur depuis la fenêtre du salon
  await guestContext.close();
  await expect(host.getByRole('button', { name: 'Salon' })).toContainText('1/2');
  await host.getByRole('button', { name: 'Salon' }).click();
  host.once('dialog', (d) => d.accept());
  await host
    .getByRole('dialog', { name: 'Salon' })
    .getByRole('button', { name: /Confier à l’ordinateur : Zoé/ })
    .click();
  await expect(host.getByRole('dialog', { name: 'Salon' }).getByText('Ordinateur')).toHaveCount(2);
  await host.keyboard.press('Escape');

  // le serveur fait jouer Zoé et l'autre ordinateur, puis la main revient à l'hôte
  await expect(host.getByText('Tour 2')).toBeVisible({ timeout: 30_000 });
  await expect(host.getByText('Au tour de Capitaine')).toBeVisible();
});

test('deux onglets du même navigateur ne jouent pas la même place', async ({ page: host }) => {
  await host.goto('/#/nouveau-salon');
  await host.getByRole('button', { name: /Ouvrir le salon/ }).click();
  await expect(host).toHaveURL(/#\/salon\/[A-Z2-9]{6}$/);
  const code = host.url().slice(-6);
  await expect(host.getByText('Au tour de Capitaine')).toBeVisible();

  // même navigateur (même stockage) : le deuxième onglet n'est pas pris pour l'hôte
  const tab = await host.context().newPage();
  await tab.goto(`/#/salon/${code}`);
  await expect(tab.getByRole('heading', { name: 'Rejoindre l’équipage' })).toBeVisible();
  await tab.getByLabel('Votre nom').fill('Zoé');
  await tab.getByRole('button', { name: 'Prendre ce héros' }).click();
  await expect(tab.getByText('Capitaine joue…')).toBeVisible();
  await expect(host.getByRole('button', { name: 'Salon' })).toContainText('2/2');

  // chaque onglet retrouve sa place après rechargement
  await tab.reload();
  await expect(tab.getByText('Capitaine joue…')).toBeVisible();
  await host.reload();
  await expect(host.getByText('Au tour de Capitaine')).toBeVisible();

  // l'accueil liste les deux places de l'appareil dans ce salon
  const home = await host.context().newPage();
  await home.goto('/');
  const rooms = home.locator('.online-rooms');
  await expect(rooms.getByText('👑 Hôte · Capitaine')).toBeVisible();
  await expect(rooms.getByText('Invité · Zoé')).toBeVisible();
});
