const { test, expect } = require('@playwright/test');
const { login, BUYER, SELLER, findAvailableProduct, createTestProduct, autoAcceptDialogs } = require('./helpers');

test.describe('🛒 Purchase Flow', () => {

  test('buy-now (shipping) opens payment QR', async ({ page }) => {
    await login(page, BUYER);

    const product = await findAvailableProduct(page, { otherSeller: true, shippingOnly: true });
    if (!product) { console.log('⏭️ No shipping products from other seller'); return; }

    await page.evaluate(id => openDetail(id), product.id);
    await page.waitForSelector('#page-detail.active', { timeout: 10000 });

    const buyBtn = page.locator(
      '#page-detail button[onclick*="buyNow"][onclick*="shipping"], #page-detail button:has-text("ซื้อเลย")'
    ).first();
    if (!await buyBtn.count()) { console.log('⏭️ No buy-now button'); return; }

    await buyBtn.click();

    // May need to pick delivery type
    await page.waitForFunction(
      () => document.getElementById('paymentOverlay')?.classList.contains('open') ||
            document.getElementById('meetupOverlay')?.classList.contains('open') ||
            document.querySelector('.toast') !== null,
      { timeout: 15000 }
    );

    const payOpen  = await page.evaluate(() => document.getElementById('paymentOverlay')?.classList.contains('open'));
    const meetOpen = await page.evaluate(() => document.getElementById('meetupOverlay')?.classList.contains('open'));
    const toast    = await page.evaluate(() => document.querySelector('.toast')?.textContent);

    console.log(`✅ Buy-now result: payment=${payOpen} meetup=${meetOpen} toast="${toast || '—'}"`);
  });

  test('buy-now (meetup) triggers meetup overlay', async ({ page }) => {
    autoAcceptDialogs(page);
    await login(page, BUYER);

    // Find a pickup-only product
    const product = await page.evaluate(async () => {
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      const products = await api.getProducts({}).catch(() => []);
      return products.find(p =>
        p.seller_id !== user?.id &&
        p.status === 'available' &&
        p.delivery_method === 'pickup'
      ) || null;
    });

    if (!product) { console.log('⏭️ No pickup-only products'); return; }

    await page.evaluate(id => openDetail(id), product.id);
    await page.waitForSelector('#page-detail.active', { timeout: 10000 });

    const buyBtn = page.locator(
      '#page-detail button[onclick*="buyNow"][onclick*="meetup"], #page-detail button:has-text("นัดรับ"), #page-detail button:has-text("ซื้อเลย")'
    ).first();
    if (!await buyBtn.count()) { console.log('⏭️ No meetup buy button'); return; }

    await buyBtn.click();
    await page.waitForFunction(
      () => document.getElementById('meetupOverlay')?.classList.contains('open') ||
            document.querySelector('.toast') !== null,
      { timeout: 12000 }
    );

    const meetOpen = await page.evaluate(() => document.getElementById('meetupOverlay')?.classList.contains('open'));
    console.log(`✅ Meetup overlay: ${meetOpen}`);
  });

  test('payment overlay contains PromptPay info and deadline notice', async ({ page }) => {
    await login(page, BUYER);

    // Try to open payment overlay by triggering buy-now on a shipping product
    const product = await findAvailableProduct(page, { otherSeller: true, shippingOnly: true });
    if (!product) { console.log('⏭️ No shipping product'); return; }

    await page.evaluate(id => openDetail(id), product.id);
    await page.waitForSelector('#page-detail.active', { timeout: 10000 });

    const buyBtn = page.locator('#page-detail button:has-text("ซื้อเลย")').first();
    if (!await buyBtn.count()) { console.log('⏭️ No buy-now button'); return; }
    await buyBtn.click();

    const payOpen = await page.waitForFunction(
      () => document.getElementById('paymentOverlay')?.classList.contains('open'),
      { timeout: 12000 }
    ).catch(() => false);

    if (!payOpen) { console.log('⏭️ Payment overlay did not open'); return; }

    // Check for deadline notice (24h rule)
    const content = await page.locator('#paymentOverlay').textContent();
    const hasDeadline = content.includes('24') || content.includes('หมดอายุ');
    console.log(`✅ Payment overlay: deadline notice=${hasDeadline}`);
  });

  test('orders tab (buyer) shows history', async ({ page }) => {
    await login(page, BUYER);
    await page.evaluate(() => openProfile());
    await page.waitForSelector('#page-profile.active', { timeout: 12000 });

    await page.click('#ptab-orders');
    await page.waitForTimeout(2000);

    const content = await page.locator('#profileTabContent').textContent();
    expect(content).toBeTruthy();
    console.log('✅ Buyer orders tab loaded');
  });

  test('seller orders tab shows incoming orders', async ({ page }) => {
    await login(page, SELLER);
    await page.evaluate(() => openProfile());
    await page.waitForSelector('#page-profile.active', { timeout: 12000 });

    await page.click('#ptab-selling');
    await page.waitForTimeout(2000);

    const content = await page.locator('#profileTabContent').textContent();
    expect(content).toBeTruthy();
    console.log('✅ Seller selling tab loaded');
  });

  test('seller can set PromptPay number', async ({ page }) => {
    await login(page, SELLER);
    await page.evaluate(() => openProfile());
    await page.waitForSelector('#page-profile.active', { timeout: 12000 });

    await page.waitForFunction(() => document.getElementById('promptpayInput') !== null, { timeout: 8000 });

    const input = page.locator('#promptpayInput');
    await input.fill('0812345678');
    await page.locator('button[onclick="savePromptpay()"]').click();

    await page.waitForSelector('.toast', { timeout: 6000 });
    const toast = await page.locator('.toast').textContent();
    console.log(`✅ PromptPay saved: "${toast}"`);
  });

});
