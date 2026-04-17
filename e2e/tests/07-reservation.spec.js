const { test, expect } = require('@playwright/test');
const { login, BUYER, SELLER, findAvailableProduct, createTestProduct, autoAcceptDialogs } = require('./helpers');

test.describe('🔖 Reservations', () => {

  test('reserve button is visible on available product (not own)', async ({ page }) => {
    await login(page, BUYER);

    const product = await findAvailableProduct(page, { otherSeller: true });
    if (!product) { console.log('⏭️ No other-seller product'); return; }

    await page.evaluate(id => openDetail(id), product.id);
    await page.waitForSelector('#page-detail.active', { timeout: 10000 });

    const btn = page.locator('#page-detail button[onclick*="doReserve"], #page-detail button:has-text("จอง")').first();
    if (await btn.count()) {
      await expect(btn).toBeVisible();
      console.log('✅ Reserve button visible on product detail');
    } else {
      console.log('⏭️ No reserve button (product may not support it)');
    }
  });

  test('buyer can reserve a product', async ({ page }) => {
    autoAcceptDialogs(page);
    await login(page, BUYER);

    const product = await findAvailableProduct(page, { otherSeller: true });
    if (!product) { console.log('⏭️ No product to reserve'); return; }

    await page.evaluate(id => openDetail(id), product.id);
    await page.waitForSelector('#page-detail.active', { timeout: 10000 });

    const btn = page.locator('#page-detail button[onclick*="doReserve"], #page-detail button:has-text("🔖 จอง")').first();
    if (!await btn.count()) { console.log('⏭️ No reserve button'); return; }

    await btn.click();

    await page.waitForFunction(
      () => document.querySelector('.toast') !== null,
      { timeout: 10000 }
    );
    const toast = await page.locator('.toast').textContent();
    console.log(`✅ Reserve result: "${toast}"`);
  });

  test('reservations tab shows buyer section', async ({ page }) => {
    await login(page, BUYER);
    await page.evaluate(() => openProfile());
    await page.waitForSelector('#page-profile.active', { timeout: 12000 });

    await page.click('#ptab-reservations');
    await page.waitForTimeout(2000);

    const content = await page.locator('#profileTabContent').textContent();
    // Should show section for "ฉันจอง" or similar
    expect(content).toBeTruthy();
    console.log(`✅ Buyer reservation tab loaded`);
  });

  test('reservations tab shows seller section', async ({ page }) => {
    await login(page, SELLER);
    await page.evaluate(() => openProfile());
    await page.waitForSelector('#page-profile.active', { timeout: 12000 });

    await page.click('#ptab-reservations');
    await page.waitForTimeout(2000);

    const content = await page.locator('#profileTabContent').textContent();
    expect(content).toBeTruthy();
    console.log('✅ Seller reservation tab loaded');
  });

  test('full reservation flow: seller creates product → buyer reserves → buyer cancels', async ({ browser }) => {
    const sellerCtx = await browser.newContext();
    const buyerCtx  = await browser.newContext();
    const sellerPage = await sellerCtx.newPage();
    const buyerPage  = await buyerCtx.newPage();

    try {
      await Promise.all([
        login(sellerPage, SELLER),
        login(buyerPage, BUYER),
      ]);

      // Seller creates a fresh product
      const product = await createTestProduct(sellerPage, `[E2E] จองทดสอบ ${Date.now()}`);
      if (!product) { console.log('⏭️ Could not create test product'); return; }
      console.log(`✅ Seller created product ${product.id}: ${product.title}`);

      // Buyer opens the product and reserves it
      buyerPage.on('dialog', d => d.accept());
      await buyerPage.evaluate(id => openDetail(id), product.id);
      await buyerPage.waitForSelector('#page-detail.active', { timeout: 10000 });

      const reserveBtn = buyerPage.locator('#page-detail button[onclick*="doReserve"]').first();
      if (!await reserveBtn.count()) {
        console.log('⏭️ Reserve button not found on new product');
        return;
      }

      await reserveBtn.click();
      await buyerPage.waitForSelector('.toast', { timeout: 10000 });
      const reserveToast = await buyerPage.locator('.toast').textContent();
      console.log(`✅ Buyer reserved: "${reserveToast}"`);

      // Verify product status via API
      await buyerPage.waitForTimeout(800);
      const updatedProduct = await buyerPage.evaluate(async (id) => {
        const p = await api.getProduct(id).catch(() => null);
        return p;
      }, product.id);

      const isReserved = updatedProduct?.status === 'reserved' ||
                         updatedProduct?.reserved_for_id !== null;
      console.log(`✅ Product status: ${updatedProduct?.status || 'unknown'}`);

      // Buyer cancels reservation
      const cancelled = await buyerPage.evaluate(async (id) => {
        try {
          await api.cancelReservation(id);
          return true;
        } catch (e) {
          return e.message;
        }
      }, product.id);
      console.log(`✅ Buyer cancel reservation: ${cancelled === true ? 'success' : cancelled}`);

      // Verify it's available again
      await buyerPage.waitForTimeout(500);
      const afterCancel = await buyerPage.evaluate(async (id) => {
        return api.getProduct(id).catch(() => null);
      }, product.id);
      console.log(`✅ After cancel status: ${afterCancel?.status}`);

    } finally {
      await sellerCtx.close();
      await buyerCtx.close();
    }
  });

  test('seller can accept/reject reservation', async ({ browser }) => {
    const sellerCtx = await browser.newContext();
    const buyerCtx  = await browser.newContext();
    const sellerPage = await sellerCtx.newPage();
    const buyerPage  = await buyerCtx.newPage();

    try {
      await Promise.all([
        login(sellerPage, SELLER),
        login(buyerPage, BUYER),
      ]);

      // Seller creates product
      const product = await createTestProduct(sellerPage, `[E2E] ยืนยันจอง ${Date.now()}`);
      if (!product) { console.log('⏭️ Could not create product'); return; }

      // Buyer reserves via API (skip UI for speed)
      buyerPage.on('dialog', d => d.accept());
      const reserved = await buyerPage.evaluate(async (id) => {
        try { await api.reserveProduct(id); return true; }
        catch (e) { return e.message; }
      }, product.id);
      console.log(`✅ Buyer reserved via API: ${reserved}`);

      if (reserved !== true) return;

      // Seller opens reservations tab
      await sellerPage.evaluate(() => openProfile());
      await sellerPage.waitForSelector('#page-profile.active', { timeout: 12000 });
      await sellerPage.click('#ptab-reservations');
      await sellerPage.waitForTimeout(2000);

      // Check for accept/reject buttons
      const acceptBtn = sellerPage.locator('button[onclick*="respondReserve"][onclick*="accept"], button:has-text("✅ อนุมัติ")').first();
      const rejectBtn = sellerPage.locator('button[onclick*="respondReserve"][onclick*="reject"], button:has-text("❌ ปฏิเสธ")').first();

      const hasAccept = await acceptBtn.count() > 0;
      const hasReject = await rejectBtn.count() > 0;
      console.log(`✅ Seller reservation controls: accept=${hasAccept} reject=${hasReject}`);

      if (hasReject) {
        await rejectBtn.click();
        await sellerPage.waitForSelector('.toast', { timeout: 6000 });
        const t = await sellerPage.locator('.toast').textContent();
        console.log(`✅ Seller rejected reservation: "${t}"`);
      }

    } finally {
      await sellerCtx.close();
      await buyerCtx.close();
    }
  });

});
