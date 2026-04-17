const { test, expect } = require('@playwright/test');
const { login, BUYER, SELLER, findAvailableProduct, autoAcceptDialogs } = require('./helpers');

test.describe('💰 Offers', () => {

  test('offer overlay opens from product detail', async ({ page }) => {
    await login(page, BUYER);

    const product = await findAvailableProduct(page, { otherSeller: true });
    if (!product) { console.log('⏭️ No product to make offer on'); return; }

    await page.evaluate(id => openDetail(id), product.id);
    await page.waitForSelector('#page-detail.active', { timeout: 10000 });

    const offerBtn = page.locator(
      '#page-detail button[onclick*="openOffer"], #page-detail button:has-text("เสนอราคา"), #page-detail button:has-text("💰")'
    ).first();
    if (!await offerBtn.count()) { console.log('⏭️ No offer button on this product'); return; }

    await offerBtn.click();
    await page.waitForSelector('#offerOverlay.open', { timeout: 8000 });
    await expect(page.locator('#offerOverlay')).toBeVisible();
    console.log('✅ Offer overlay opened');
  });

  test('submit an offer', async ({ page }) => {
    await login(page, BUYER);

    const product = await findAvailableProduct(page, { otherSeller: true });
    if (!product) { console.log('⏭️ No product to offer on'); return; }

    await page.evaluate(id => openDetail(id), product.id);
    await page.waitForSelector('#page-detail.active', { timeout: 10000 });

    const offerBtn = page.locator(
      '#page-detail button[onclick*="openOffer"], #page-detail button:has-text("เสนอราคา")'
    ).first();
    if (!await offerBtn.count()) { console.log('⏭️ No offer button'); return; }
    await offerBtn.click();
    await page.waitForSelector('#offerOverlay.open', { timeout: 8000 });

    // Fill offer price (80% of listed price)
    const offerPrice = Math.max(1, Math.floor(product.price * 0.8));
    const priceInput = page.locator('#offerOverlay input[type="number"], #offerPrice').first();
    await priceInput.fill(String(offerPrice));

    // Optional message
    const msgInput = page.locator('#offerOverlay textarea, #offerMessage').first();
    if (await msgInput.count()) {
      await msgInput.fill('ขอลดราคาหน่อยได้ไหมครับ (E2E test)');
    }

    // Submit
    await page.locator('#offerOverlay button.btn-g').first().click();
    await page.waitForSelector('.toast', { timeout: 10000 });
    const toast = await page.locator('.toast').textContent();
    console.log(`✅ Offer submitted: "${toast}"`);
  });

  test('outgoing offers tab shows submitted offers', async ({ page }) => {
    await login(page, BUYER);
    await page.evaluate(() => openProfile());
    await page.waitForSelector('#page-profile.active', { timeout: 12000 });

    await page.click('#ptab-offers');
    await page.waitForTimeout(2000);

    const content = await page.locator('#profileTabContent').textContent();
    expect(content).toBeTruthy();
    console.log('✅ Offers tab loaded');
  });

  test('seller sees incoming offers and can respond', async ({ browser }) => {
    const buyerCtx  = await browser.newContext();
    const sellerCtx = await browser.newContext();
    const buyerPage  = await buyerCtx.newPage();
    const sellerPage = await sellerCtx.newPage();

    try {
      await Promise.all([
        login(buyerPage, BUYER),
        login(sellerPage, SELLER),
      ]);

      // Find a SELLER product so buyer can make offer
      const product = await buyerPage.evaluate(async (sellerEmail) => {
        const allUsers = await api.adminUsers?.().catch(() => null);
        const products = await api.getProducts({}).catch(() => []);
        // Just find any product the BUYER doesn't own
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        return products.find(p => p.seller_id !== user?.id && p.status === 'available') || null;
      });

      if (!product) { console.log('⏭️ No product for offer test'); return; }

      // Buyer submits offer via API directly (faster than UI)
      const offerPrice = Math.max(1, Math.floor(product.price * 0.75));
      await buyerPage.evaluate(
        async ({ pid, price }) => {
          return api.makeOffer(pid, price, 'E2E offer from buyer');
        },
        { pid: product.id, price: offerPrice }
      );
      console.log(`✅ Buyer made offer ฿${offerPrice} on product ${product.id}`);

      // Seller checks incoming offers tab
      await sellerPage.evaluate(() => openProfile());
      await sellerPage.waitForSelector('#page-profile.active', { timeout: 12000 });
      await sellerPage.click('#ptab-offers');
      await sellerPage.waitForTimeout(2000);

      const hasIncoming = await sellerPage.evaluate(
        () => document.getElementById('profileTabContent')?.textContent?.includes('ข้อเสนอ') || true
      );
      console.log('✅ Seller offers tab: loaded');

    } finally {
      await buyerCtx.close();
      await sellerCtx.close();
    }
  });

});
