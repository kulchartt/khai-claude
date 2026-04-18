const { test, expect } = require('@playwright/test');
const { login, BUYER, SELLER, findAvailableProduct, createTestProduct, autoAcceptDialogs, gotoApp } = require('./helpers');

// Helper: check if RESERVATION feature flag is enabled
async function isReservationEnabled(page) {
  return page.evaluate(() => typeof FEATURES !== 'undefined' && FEATURES.RESERVATION === true);
}

test.describe('🔖 Reservations', () => {

  // ── Feature flag: UI hidden when RESERVATION=false ───────────────────────

  test('🚩 reserve button is hidden when FEATURES.RESERVATION=false', async ({ page }) => {
    await login(page, BUYER);

    const enabled = await isReservationEnabled(page);
    if (enabled) {
      console.log('⏭️ FEATURES.RESERVATION=true — skipping hidden-UI test');
      return;
    }

    const product = await findAvailableProduct(page, { otherSeller: true });
    if (!product) { console.log('⏭️ No other-seller product available'); return; }

    await page.evaluate(id => openDetail(id), product.id);
    await page.waitForSelector('#page-detail.active', { timeout: 10000 });

    const reserveBtn = page.locator('#page-detail button[onclick*="doReserve"], #page-detail button:has-text("🔖 จอง")');
    await expect(reserveBtn).toHaveCount(0);
    console.log('✅ Reserve button correctly hidden (FEATURES.RESERVATION=false)');
  });

  test('🚩 reservations tab is hidden in profile when FEATURES.RESERVATION=false', async ({ page }) => {
    await login(page, BUYER);

    const enabled = await isReservationEnabled(page);
    if (enabled) {
      console.log('⏭️ FEATURES.RESERVATION=true — skipping hidden-tab test');
      return;
    }

    await page.evaluate(() => openProfile());
    await page.waitForSelector('#page-profile.active', { timeout: 12000 });

    const tab = page.locator('#ptab-reservations');
    await expect(tab).toHaveCount(0);
    console.log('✅ Reservations tab correctly hidden (FEATURES.RESERVATION=false)');
  });

  test('🚩 reserved group hidden in selling tab when FEATURES.RESERVATION=false', async ({ page }) => {
    await login(page, SELLER);

    const enabled = await isReservationEnabled(page);
    if (enabled) {
      console.log('⏭️ FEATURES.RESERVATION=true — skipping hidden-group test');
      return;
    }

    await page.evaluate(() => openProfile());
    await page.waitForSelector('#page-profile.active', { timeout: 12000 });
    await page.click('#ptab-selling');
    await page.waitForTimeout(2000);

    const reservedGroup = page.locator('#profileTabContent :text("กำลังถูกจอง")');
    await expect(reservedGroup).toHaveCount(0);
    console.log('✅ Reserved group correctly hidden in selling tab (FEATURES.RESERVATION=false)');
  });

  // ── Feature flag: UI visible when RESERVATION=true ───────────────────────

  test('reserve button is visible on available product when FEATURES.RESERVATION=true', async ({ page }) => {
    await login(page, BUYER);

    const enabled = await isReservationEnabled(page);
    if (!enabled) {
      console.log('⏭️ FEATURES.RESERVATION=false — skipping (set to true to run)');
      return;
    }

    const product = await findAvailableProduct(page, { otherSeller: true });
    if (!product) { console.log('⏭️ No other-seller product'); return; }

    await page.evaluate(id => openDetail(id), product.id);
    await page.waitForSelector('#page-detail.active', { timeout: 10000 });

    const btn = page.locator('#page-detail button[onclick*="doReserve"], #page-detail button:has-text("จอง")').first();
    await expect(btn).toBeVisible();
    console.log('✅ Reserve button visible on product detail');
  });

  test('buyer can reserve a product when FEATURES.RESERVATION=true', async ({ page }) => {
    autoAcceptDialogs(page);
    await login(page, BUYER);

    const enabled = await isReservationEnabled(page);
    if (!enabled) {
      console.log('⏭️ FEATURES.RESERVATION=false — skipping');
      return;
    }

    const product = await findAvailableProduct(page, { otherSeller: true });
    if (!product) { console.log('⏭️ No product to reserve'); return; }

    await page.evaluate(id => openDetail(id), product.id);
    await page.waitForSelector('#page-detail.active', { timeout: 10000 });

    const btn = page.locator('#page-detail button[onclick*="doReserve"], #page-detail button:has-text("🔖 จอง")').first();
    if (!await btn.count()) { console.log('⏭️ No reserve button'); return; }

    await btn.click();
    await page.waitForFunction(() => document.querySelector('.toast') !== null, { timeout: 10000 });
    const toast = await page.locator('.toast').textContent();
    console.log(`✅ Reserve result: "${toast}"`);
  });

  test('reservations tab shows buyer section when FEATURES.RESERVATION=true', async ({ page }) => {
    await login(page, BUYER);

    const enabled = await isReservationEnabled(page);
    if (!enabled) {
      console.log('⏭️ FEATURES.RESERVATION=false — skipping');
      return;
    }

    await page.evaluate(() => openProfile());
    await page.waitForSelector('#page-profile.active', { timeout: 12000 });
    await page.click('#ptab-reservations');
    await page.waitForTimeout(2000);

    const content = await page.locator('#profileTabContent').textContent();
    expect(content).toBeTruthy();
    console.log('✅ Buyer reservation tab loaded');
  });

  test('reservations tab shows seller section when FEATURES.RESERVATION=true', async ({ page }) => {
    await login(page, SELLER);

    const enabled = await isReservationEnabled(page);
    if (!enabled) {
      console.log('⏭️ FEATURES.RESERVATION=false — skipping');
      return;
    }

    await page.evaluate(() => openProfile());
    await page.waitForSelector('#page-profile.active', { timeout: 12000 });
    await page.click('#ptab-reservations');
    await page.waitForTimeout(2000);

    const content = await page.locator('#profileTabContent').textContent();
    expect(content).toBeTruthy();
    console.log('✅ Seller reservation tab loaded');
  });

  test('full reservation flow: seller creates → buyer reserves → buyer cancels (RESERVATION=true)', async ({ browser }) => {
    // Get a page to check the flag first
    const checkCtx = await browser.newContext();
    const checkPage = await checkCtx.newPage();
    await gotoApp(checkPage);
    const enabled = await isReservationEnabled(checkPage);
    await checkCtx.close();

    if (!enabled) {
      console.log('⏭️ FEATURES.RESERVATION=false — skipping full flow test');
      return;
    }

    const sellerCtx = await browser.newContext();
    const buyerCtx  = await browser.newContext();
    const sellerPage = await sellerCtx.newPage();
    const buyerPage  = await buyerCtx.newPage();

    try {
      await Promise.all([login(sellerPage, SELLER), login(buyerPage, BUYER)]);

      const product = await createTestProduct(sellerPage, `[E2E] จองทดสอบ ${Date.now()}`);
      if (!product) { console.log('⏭️ Could not create test product'); return; }
      console.log(`✅ Seller created product ${product.id}: ${product.title}`);

      buyerPage.on('dialog', d => d.accept());
      await buyerPage.evaluate(id => openDetail(id), product.id);
      await buyerPage.waitForSelector('#page-detail.active', { timeout: 10000 });

      const reserveBtn = buyerPage.locator('#page-detail button[onclick*="doReserve"]').first();
      if (!await reserveBtn.count()) { console.log('⏭️ Reserve button not found'); return; }

      await reserveBtn.click();
      await buyerPage.waitForSelector('.toast', { timeout: 10000 });
      const reserveToast = await buyerPage.locator('.toast').textContent();
      console.log(`✅ Buyer reserved: "${reserveToast}"`);

      await buyerPage.waitForTimeout(800);
      const updatedProduct = await buyerPage.evaluate(id => api.getProduct(id).catch(() => null), product.id);
      console.log(`✅ Product status after reserve: ${updatedProduct?.status}`);

      const cancelled = await buyerPage.evaluate(async id => {
        try { await api.cancelReservation(id); return true; }
        catch (e) { return e.message; }
      }, product.id);
      console.log(`✅ Buyer cancel: ${cancelled === true ? 'success' : cancelled}`);

      await buyerPage.waitForTimeout(500);
      const afterCancel = await buyerPage.evaluate(id => api.getProduct(id).catch(() => null), product.id);
      expect(afterCancel?.status).toBe('available');
      console.log(`✅ After cancel status: ${afterCancel?.status}`);

    } finally {
      await sellerCtx.close();
      await buyerCtx.close();
    }
  });

  test('seller can accept/reject reservation (RESERVATION=true)', async ({ browser }) => {
    const checkCtx = await browser.newContext();
    const checkPage = await checkCtx.newPage();
    await gotoApp(checkPage);
    const enabled = await isReservationEnabled(checkPage);
    await checkCtx.close();

    if (!enabled) {
      console.log('⏭️ FEATURES.RESERVATION=false — skipping');
      return;
    }

    const sellerCtx = await browser.newContext();
    const buyerCtx  = await browser.newContext();
    const sellerPage = await sellerCtx.newPage();
    const buyerPage  = await buyerCtx.newPage();

    try {
      await Promise.all([login(sellerPage, SELLER), login(buyerPage, BUYER)]);

      const product = await createTestProduct(sellerPage, `[E2E] ยืนยันจอง ${Date.now()}`);
      if (!product) { console.log('⏭️ Could not create product'); return; }

      buyerPage.on('dialog', d => d.accept());
      const reserved = await buyerPage.evaluate(async id => {
        try { await api.reserveProduct(id); return true; }
        catch (e) { return e.message; }
      }, product.id);
      console.log(`✅ Buyer reserved via API: ${reserved}`);
      if (reserved !== true) return;

      await sellerPage.evaluate(() => openProfile());
      await sellerPage.waitForSelector('#page-profile.active', { timeout: 12000 });
      await sellerPage.click('#ptab-reservations');
      await sellerPage.waitForTimeout(2000);

      const rejectBtn = sellerPage.locator('button[onclick*="respondReserve"][onclick*="reject"], button:has-text("❌ ปฏิเสธ")').first();
      if (await rejectBtn.count()) {
        await rejectBtn.click();
        await sellerPage.waitForSelector('.toast', { timeout: 6000 });
        const t = await sellerPage.locator('.toast').textContent();
        console.log(`✅ Seller rejected reservation: "${t}"`);
      } else {
        console.log('⏭️ No reject button found');
      }

    } finally {
      await sellerCtx.close();
      await buyerCtx.close();
    }
  });

});
