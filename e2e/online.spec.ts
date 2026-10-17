import { expect, test } from '@playwright/test';

// Partie en ligne via le serveur (projet « online » de playwright.config.ts) :
// deux contextes de navigateur, donc deux joueurs avec chacun leur stockage local.

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
  await guest.getByRole('button', { name: 'Prendre ce héros' }).click();

  await expect(host.getByRole('button', { name: 'Salon' })).toContainText('2/2');
  await expect(host.getByText('Au tour de Capitaine')).toBeVisible();
  await expect(guest.getByText('Capitaine joue…')).toBeVisible();

  // l'hôte passe la main à l'invité
  await host.getByRole('button', { name: /Finir le tour/ }).click();
  await expect(guest.getByText('Au tour de Zoé')).toBeVisible();
  await expect(host.getByText('Zoé joue…')).toBeVisible();

  // l'invité finit à son tour : le serveur fait jouer l'ordinateur, puis la main revient à l'hôte
  await guest.getByRole('button', { name: /Finir le tour/ }).click();
  await expect(host.getByText('Tour 2')).toBeVisible({ timeout: 30_000 });
  await expect(host.getByText('Au tour de Capitaine')).toBeVisible();
  await expect(guest.getByText('Tour 2')).toBeVisible();

  await guestContext.close();
});
