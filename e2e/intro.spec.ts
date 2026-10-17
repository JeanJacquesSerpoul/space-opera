import { expect, test } from '@playwright/test';

// Présentation animée : jouée à la première visite, puis depuis l'accueil.

test('montre la présentation à la première visite, puis sur demande', async ({ page }) => {
  await page.goto('/');
  const intro = page.getByRole('dialog', { name: 'Présentation du jeu' });
  await expect(intro).toBeVisible();

  await intro.getByRole('button', { name: /touchez pour lancer/ }).click();
  await expect(intro.getByText(/Bienvenue à bord/)).toBeVisible();
  await expect(intro.getByRole('heading', { name: 'Space Opera' })).toBeVisible();

  // aller au chapitre du d20 : le jet réussit
  await intro.getByRole('button', { name: 'Chapitre 4 : Le d20' }).click();
  await expect(intro.getByText('✓ Réussite !')).toBeVisible();

  await intro.getByRole('button', { name: /Passer/ }).click();
  await expect(intro).toBeHidden();

  // déjà vue : elle ne revient pas toute seule, mais l'accueil la propose
  await page.reload();
  await expect(page.getByRole('button', { name: 'Nouvelle partie' })).toBeVisible();
  await expect(intro).toBeHidden();
  await page.getByRole('button', { name: /Découvrir le jeu/ }).click();
  await expect(intro).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(intro).toBeHidden();
});

test('ne montre pas la présentation à un invité arrivé par un lien', async ({ page }) => {
  await page.goto('/#/salon/ABC234');
  await expect(page.getByRole('dialog', { name: 'Présentation du jeu' })).toHaveCount(0);
});
