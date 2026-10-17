import { expect, test } from '@playwright/test';

// Version hors ligne (moteur dans le navigateur) : voir playwright.config.ts.

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
