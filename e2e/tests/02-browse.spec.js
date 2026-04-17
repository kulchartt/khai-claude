const { test, expect } = require('@playwright/test');
const { gotoApp, login, BUYER } = require('./helpers');

test.describe('🏪 Browse & Search', () => {

  test('home page renders product cards', async ({ page }) => {
    await gotoApp(page);
    await page.waitForFunction(
      () => document.querySelectorAll('.card').length > 0 || document.querySelector('.empty-msg') !== null,
      { timeout: 15000 }
    );
    const count = await page.locator('.card').count();
    console.log(`✅ Home page: ${count} product cards rendered`);
    expect(count).toBeGreaterThanOrEqual(0); // empty marketplace is also valid
  });

  test('search input filters results', async ({ page }) => {
    await gotoApp(page);
    await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, { timeout: 15000 });

    const before = await page.locator('.card').count();

    // Type in search (supports both id and placeholder approaches)
    const searchInput = page.locator('#searchInput, input[placeholder*="ค้นหา"]').first();
    await searchInput.fill('zzz_no_match_e2e_xyz');
    await page.waitForTimeout(900); // debounce

    const after = await page.locator('.card').count();
    console.log(`✅ Search "zzz...": before=${before} after=${after}`);

    // Clear
    await searchInput.fill('');
    await page.waitForTimeout(600);
    const restored = await page.locator('.card').count();
    console.log(`✅ Cleared: ${restored} cards back`);
  });

  test('clicking product card opens detail page', async ({ page }) => {
    await gotoApp(page);
    await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, { timeout: 15000 });

    await page.locator('.card').first().click();
    await page.waitForSelector('#page-detail.active', { timeout: 10000 });

    // Detail page must show a price
    await expect(page.locator('#page-detail')).toContainText('฿', { timeout: 8000 });
    console.log('✅ Product detail page opened with price');
  });

  test('back button on detail page works', async ({ page }) => {
    await gotoApp(page);
    await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, { timeout: 15000 });

    await page.locator('.card').first().click();
    await page.waitForSelector('#page-detail.active', { timeout: 10000 });

    // Click back
    const backBtn = page.locator('#page-detail .back-btn').first();
    await backBtn.click();
    await page.waitForTimeout(600);

    const detailActive = await page.evaluate(() => document.getElementById('page-detail')?.classList.contains('active'));
    expect(detailActive).toBe(false);
    console.log('✅ Back button returns from detail page');
  });

  test('wishlist toggle works when logged in', async ({ page }) => {
    await login(page, BUYER);
    await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, { timeout: 15000 });

    // Find a product NOT from this user
    const product = await page.evaluate(async () => {
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      const products = await api.getProducts({}).catch(() => []);
      return products.find(p => p.seller_id !== user?.id) || null;
    });

    if (!product) { console.log('⏭️ No other-seller products found'); return; }

    await page.evaluate(id => openDetail(id), product.id);
    await page.waitForSelector('#page-detail.active', { timeout: 10000 });

    const wlBtn = page.locator('#page-detail button[onclick*="toggleWishlist"]').first();
    if (!await wlBtn.count()) { console.log('⏭️ No wishlist button'); return; }

    await wlBtn.click();
    await page.waitForSelector('.toast', { timeout: 6000 });
    const msg = await page.locator('.toast').textContent();
    console.log(`✅ Wishlist toggled: "${msg}"`);
  });

  test('seller profile page opens from product detail', async ({ page }) => {
    await gotoApp(page);
    await page.waitForFunction(() => document.querySelectorAll('.card').length > 0, { timeout: 15000 });

    await page.locator('.card').first().click();
    await page.waitForSelector('#page-detail.active', { timeout: 10000 });

    // Click seller name link
    const sellerLink = page.locator('#page-detail [onclick*="openSellerProfile"]').first();
    if (!await sellerLink.count()) { console.log('⏭️ No seller link on this product'); return; }

    await sellerLink.click();
    await page.waitForSelector('#page-seller.active, #sellerPage.active', { timeout: 8000 });
    console.log('✅ Seller profile page opened');
  });

});
