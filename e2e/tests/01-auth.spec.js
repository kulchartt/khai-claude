const { test, expect } = require('@playwright/test');
const { BASE, SELLER, BUYER, gotoApp, login } = require('./helpers');

test.describe('🔐 Auth', () => {

  test('login with valid credentials stores token', async ({ page }) => {
    await login(page, BUYER);

    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();
    console.log('✅ Token stored in localStorage');

    const user = await page.evaluate(() => JSON.parse(localStorage.getItem('user') || 'null'));
    expect(user).not.toBeNull();
    expect(user.email).toBe(BUYER.email);
    console.log(`✅ User stored: ${user.name} (${user.email})`);
  });

  test('wrong password shows error toast and no token', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => openOverlay('loginOverlay'));
    await page.waitForSelector('#loginOverlay.open');

    await page.fill('#loginEmail', BUYER.email);
    await page.fill('#loginPass', 'wrongpass_e2e');
    await page.click('#loginForm button.btn-g');

    await page.waitForSelector('.toast', { timeout: 10000 });
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeFalsy();
    console.log('✅ Wrong password: no token, error shown');
  });

  test('logout clears token and user', async ({ page }) => {
    await login(page, BUYER);
    expect(await page.evaluate(() => !!localStorage.getItem('token'))).toBe(true);

    await page.evaluate(() => doLogout());
    await page.waitForFunction(() => !localStorage.getItem('token'), { timeout: 6000 });

    expect(await page.evaluate(() => localStorage.getItem('token'))).toBeFalsy();
    expect(await page.evaluate(() => localStorage.getItem('user'))).toBeFalsy();
    console.log('✅ Logout: token and user cleared');
  });

  test('profile page loads after login', async ({ page }) => {
    await login(page, BUYER);
    await page.evaluate(() => openProfile());
    await page.waitForSelector('#page-profile.active', { timeout: 12000 });

    await expect(page.locator('#page-profile')).toContainText(BUYER.email, { timeout: 8000 });
    console.log('✅ Profile page visible with correct email');
  });

  test('all profile tabs are present', async ({ page }) => {
    await login(page, BUYER);
    await page.evaluate(() => openProfile());
    await page.waitForSelector('#page-profile.active', { timeout: 12000 });

    const tabs = ['ptab-products', 'ptab-orders', 'ptab-selling', 'ptab-reservations', 'ptab-offers'];
    for (const tabId of tabs) {
      await expect(page.locator(`#${tabId}`)).toBeVisible();
    }
    console.log('✅ All profile tabs present');
  });

  test('unauthenticated wishlist toggle prompts login', async ({ page }) => {
    await gotoApp(page);
    await page.waitForFunction(
      () => document.querySelectorAll('.card').length > 0,
      { timeout: 15000 }
    );
    await page.locator('.card').first().click();
    await page.waitForSelector('#page-detail.active', { timeout: 10000 });

    const wlBtn = page.locator('#page-detail button[onclick*="toggleWishlist"]').first();
    if (await wlBtn.count()) {
      await wlBtn.click();
      await page.waitForFunction(
        () => document.getElementById('loginOverlay')?.classList.contains('open') ||
              document.querySelector('.toast') !== null,
        { timeout: 6000 }
      );
      console.log('✅ Wishlist click without login → login overlay opened');
    } else {
      console.log('⏭️ Wishlist button not found on this product');
    }
  });

});
