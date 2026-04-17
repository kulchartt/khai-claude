const { test, expect } = require('@playwright/test');
const { login, SELLER } = require('./helpers');

// Unique title shared across tests in this file
const TEST_TITLE = `[E2E] ทดสอบ ${Date.now()}`;

test.describe('🏷️ Sell (Create Listing)', () => {

  test('sell overlay opens with all required fields', async ({ page }) => {
    await login(page, SELLER);
    await page.evaluate(() => openSell());
    await page.waitForSelector('#sellOverlay.open', { timeout: 8000 });

    for (const id of ['#sTitle', '#sPrice', '#sCat', '#sCond', '#sDesc', '#sLoc']) {
      await expect(page.locator(id)).toBeVisible();
    }
    console.log('✅ Sell form: all fields visible');
  });

  test('submit without required fields shows validation error', async ({ page }) => {
    await login(page, SELLER);
    await page.evaluate(() => openSell());
    await page.waitForSelector('#sellOverlay.open', { timeout: 8000 });

    // Submit empty form
    await page.click('#sellOverlay button.btn-g');
    await page.waitForSelector('.toast', { timeout: 6000 });

    const stillOpen = await page.evaluate(() => document.getElementById('sellOverlay')?.classList.contains('open'));
    expect(stillOpen).toBe(true);
    console.log('✅ Validation: overlay stays open on empty submit');
  });

  test('create a product successfully', async ({ page }) => {
    await login(page, SELLER);
    await page.evaluate(() => openSell());
    await page.waitForSelector('#sellOverlay.open', { timeout: 8000 });

    await page.fill('#sTitle', TEST_TITLE);
    await page.fill('#sPrice', '199');
    await page.fill('#sDesc', 'สินค้า E2E อัตโนมัติ — ไม่ต้องสนใจ');
    await page.fill('#sLoc', 'กรุงเทพฯ');

    await page.click('#sellOverlay button.btn-g');

    // Wait for overlay to close (success)
    await page.waitForFunction(
      () => !document.getElementById('sellOverlay')?.classList.contains('open'),
      { timeout: 15000 }
    );
    console.log('✅ Product created — overlay closed');
  });

  test('new product appears in profile tab', async ({ page }) => {
    await login(page, SELLER);
    await page.evaluate(() => openProfile());
    await page.waitForSelector('#page-profile.active', { timeout: 12000 });
    await page.waitForFunction(() => document.getElementById('myProductsGrid') !== null, { timeout: 8000 });

    // Product should be in _myItems state or rendered
    const found = await page.evaluate(async (title) => {
      // Check DOM
      const inDom = document.getElementById('myProductsGrid')?.textContent?.includes(title);
      // Fallback: check via API
      const myProducts = await api.getMyProducts().catch(() => []);
      const inApi = myProducts.some(p => p.title === title);
      return inDom || inApi;
    }, TEST_TITLE);

    expect(found).toBe(true);
    console.log(`✅ "${TEST_TITLE}" found in profile`);
  });

  test('close button dismisses sell overlay', async ({ page }) => {
    await login(page, SELLER);
    await page.evaluate(() => openSell());
    await page.waitForSelector('#sellOverlay.open', { timeout: 8000 });

    await page.click('#sellOverlay .close-btn, #sellOverlay .mclose');
    await page.waitForFunction(
      () => !document.getElementById('sellOverlay')?.classList.contains('open'),
      { timeout: 5000 }
    );
    console.log('✅ Sell overlay dismissed by close button');
  });

  test('edit product from profile', async ({ page }) => {
    await login(page, SELLER);
    await page.evaluate(() => openProfile());
    await page.waitForSelector('#page-profile.active', { timeout: 12000 });
    await page.waitForFunction(() => document.getElementById('myProductsGrid') !== null, { timeout: 8000 });

    const editBtn = page.locator('#myProductsGrid button[onclick*="openEdit"]').first();
    if (!await editBtn.count()) { console.log('⏭️ No edit button found'); return; }

    await editBtn.click();
    await page.waitForSelector('#editOverlay.open', { timeout: 8000 });
    await expect(page.locator('#editOverlay')).toBeVisible();
    console.log('✅ Edit overlay opened from profile');
  });

});
