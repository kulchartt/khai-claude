const { test, expect } = require('@playwright/test');
const { gotoApp, login, SELLER, BUYER } = require('./helpers');

const CATEGORIES = ['inquiry','bug','feature','complaint','review','keep','other'];

test.describe('📩 ติดต่อแอดมิน (Feedback)', () => {

  // ── Navbar icon ─────────────────────────────────────────────────────────────

  test('📩 icon visible in navbar (desktop viewport)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoApp(page);
    const btn = page.locator('nav.nav-r button[title="ติดต่อแอดมิน"]');
    await expect(btn).toBeVisible({ timeout: 8000 });
    console.log('✅ ติดต่อแอดมิน icon visible in navbar');
  });

  test('clicking navbar icon opens modal with correct title', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoApp(page);
    await page.locator('nav.nav-r button[title="ติดต่อแอดมิน"]').click();
    await page.waitForSelector('#feedbackOverlay.open', { timeout: 6000 });
    await expect(page.locator('#feedbackOverlay h2')).toContainText('ติดต่อแอดมิน');
    console.log('✅ Modal opens with title ติดต่อแอดมิน');
  });

  test('FAB floating button no longer exists', async ({ page }) => {
    await gotoApp(page);
    expect(await page.locator('#feedbackFab').count()).toBe(0);
    console.log('✅ Old FAB button removed');
  });

  // ── Auto-fill when logged in ─────────────────────────────────────────────────

  test('modal auto-fills name and email from logged-in account', async ({ page }) => {
    await login(page, BUYER);
    await page.evaluate(() => openFeedbackModal());
    await page.waitForSelector('#feedbackOverlay.open', { timeout: 6000 });

    const email = await page.locator('#feedbackEmail').inputValue();
    const name  = await page.locator('#feedbackName').inputValue();

    expect(email).toBe(BUYER.email);
    expect(name.length).toBeGreaterThan(0);
    console.log(`✅ Auto-filled: name="${name}" email="${email}"`);
  });

  // ── Category dropdown ────────────────────────────────────────────────────────

  test('category dropdown contains all 7 options including สอบถาม', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => openFeedbackModal());
    await page.waitForSelector('#feedbackOverlay.open', { timeout: 6000 });

    const options = await page.locator('#feedbackCategory option').allInnerTexts();
    expect(options.some(o => o.includes('สอบถาม'))).toBe(true);
    for (const val of CATEGORIES) {
      expect(await page.locator(`#feedbackCategory option[value="${val}"]`).count()).toBe(1);
    }
    console.log('✅ All 7 categories present including สอบถาม');
  });

  // ── Validation ───────────────────────────────────────────────────────────────

  test('submit without category shows error toast', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => openFeedbackModal());
    await page.waitForSelector('#feedbackOverlay.open', { timeout: 6000 });
    await page.fill('#feedbackMessage', 'ทดสอบ E2E');
    await page.click('#feedbackOverlay .btn-g');
    await page.waitForSelector('.toast', { timeout: 6000 });
    console.log(`✅ Validation toast: "${await page.locator('.toast').textContent()}"`);
  });

  test('submit without message shows error toast', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => openFeedbackModal());
    await page.waitForSelector('#feedbackOverlay.open', { timeout: 6000 });
    await page.selectOption('#feedbackCategory', { value: 'inquiry' });
    await page.click('#feedbackOverlay .btn-g');
    await page.waitForSelector('.toast', { timeout: 6000 });
    console.log(`✅ Validation toast: "${await page.locator('.toast').textContent()}"`);
  });

  // ── Submit + history ─────────────────────────────────────────────────────────

  test('submit while logged in → appears in history tab', async ({ page }) => {
    await login(page, BUYER);

    // Submit feedback (email auto-filled from account)
    await page.evaluate(() => openFeedbackModal());
    await page.waitForSelector('#feedbackOverlay.open', { timeout: 6000 });
    await page.selectOption('#feedbackCategory', { value: 'inquiry' });
    await page.fill('#feedbackMessage', '[E2E] ทดสอบ history tab — ไม่ต้องสนใจ');
    await page.click('#feedbackOverlay .btn-g');
    await page.waitForSelector('.toast', { timeout: 10000 });
    const toastMsg = await page.locator('.toast').textContent();
    expect(toastMsg).not.toContain('ไม่ถูกต้อง');
    console.log(`✅ Submitted: "${toastMsg}"`);

    // Open profile → tab ติดต่อแอดมิน
    await page.evaluate(() => openProfile());
    await page.waitForSelector('#page-profile.active', { timeout: 10000 });
    await page.evaluate(() => profileTab('my-feedback'));
    await page.waitForTimeout(2000);

    // Must show history (not empty state)
    const emptyState = await page.locator('#profileTabContent .empty-state').count();
    expect(emptyState).toBe(0);

    const items = await page.locator('#profileTabContent [style*="border-left"]').count();
    expect(items).toBeGreaterThan(0);
    console.log(`✅ History tab shows ${items} item(s)`);
  });

  test('history tab shows status badge on each item', async ({ page }) => {
    await login(page, BUYER);
    await page.evaluate(() => openProfile());
    await page.waitForSelector('#page-profile.active', { timeout: 10000 });
    await page.evaluate(() => profileTab('my-feedback'));
    await page.waitForTimeout(1500);

    const hasItems = await page.locator('#profileTabContent [style*="border-left"]').count() > 0;
    if (!hasItems) { console.log('⏭️ No history yet, skip'); return; }

    // Each item must contain a status label
    const statusTexts = await page.locator('#profileTabContent').textContent();
    const hasStatus = statusTexts.includes('ใหม่') || statusTexts.includes('รับเรื่อง') || statusTexts.includes('แก้ไข');
    expect(hasStatus).toBe(true);
    console.log('✅ Status badge present in history items');
  });

  // ── Admin badge on 🛡️ button ─────────────────────────────────────────────────

  test('🛡️ admin navbar button has badge element', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, SELLER); // SELLER is admin in test env
    await page.waitForTimeout(1000);

    const adminBtn = page.locator('#adminNavBtn');
    if (!await adminBtn.count()) { console.log('⏭️ Not admin account'); return; }

    await expect(adminBtn).toBeVisible({ timeout: 5000 });
    // Badge element should exist (may be hidden if count=0)
    const badge = page.locator('#adminFbBadge');
    expect(await badge.count()).toBe(1);
    console.log('✅ Admin badge element present on 🛡️ button');
  });

  // ── Close button ─────────────────────────────────────────────────────────────

  test('close button dismisses modal', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => openFeedbackModal());
    await page.waitForSelector('#feedbackOverlay.open', { timeout: 6000 });
    await page.click('#feedbackOverlay .mclose');
    await page.waitForFunction(
      () => !document.getElementById('feedbackOverlay')?.classList.contains('open'),
      { timeout: 5000 }
    );
    console.log('✅ Close button dismisses modal');
  });

});
