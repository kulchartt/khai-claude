const { test, expect } = require('@playwright/test');
const { gotoApp, login, SELLER } = require('./helpers');

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
    const fab = page.locator('#feedbackFab');
    expect(await fab.count()).toBe(0);
    console.log('✅ Old FAB button removed');
  });

  // ── Category dropdown ────────────────────────────────────────────────────────

  test('category dropdown contains all 7 options including สอบถาม', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => openFeedbackModal());
    await page.waitForSelector('#feedbackOverlay.open', { timeout: 6000 });

    const options = await page.locator('#feedbackCategory option').allInnerTexts();
    console.log('Options found:', options);

    // สอบถาม must be present
    expect(options.some(o => o.includes('สอบถาม'))).toBe(true);

    // All backend-valid categories must map to an option
    for (const val of CATEGORIES) {
      const exists = await page.locator(`#feedbackCategory option[value="${val}"]`).count();
      expect(exists).toBe(1);
    }
    console.log('✅ All 7 categories present including สอบถาม');
  });

  // ── Validation ───────────────────────────────────────────────────────────────

  test('submit without category shows error toast', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => openFeedbackModal());
    await page.waitForSelector('#feedbackOverlay.open', { timeout: 6000 });

    await page.fill('#feedbackMessage', 'ทดสอบ E2E');
    // leave category blank
    await page.click('#feedbackOverlay .btn-g');
    await page.waitForSelector('.toast', { timeout: 6000 });
    const msg = await page.locator('.toast').textContent();
    console.log(`✅ Validation toast: "${msg}"`);
  });

  test('submit without message shows error toast', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => openFeedbackModal());
    await page.waitForSelector('#feedbackOverlay.open', { timeout: 6000 });

    await page.selectOption('#feedbackCategory', { value: 'inquiry' });
    // leave message blank
    await page.click('#feedbackOverlay .btn-g');
    await page.waitForSelector('.toast', { timeout: 6000 });
    const msg = await page.locator('.toast').textContent();
    console.log(`✅ Validation toast: "${msg}"`);
  });

  // ── Submit each new/changed category ────────────────────────────────────────

  test('submit with category สอบถาม succeeds', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => openFeedbackModal());
    await page.waitForSelector('#feedbackOverlay.open', { timeout: 6000 });

    await page.selectOption('#feedbackCategory', { value: 'inquiry' });
    await page.fill('#feedbackMessage', '[E2E] ทดสอบหมวดสอบถาม — ไม่ต้องสนใจ');
    await page.click('#feedbackOverlay .btn-g');

    await page.waitForSelector('.toast', { timeout: 10000 });
    const msg = await page.locator('.toast').textContent();
    expect(msg).not.toContain('ไม่ถูกต้อง');
    expect(msg).not.toContain('error');
    console.log(`✅ สอบถาม submitted: "${msg}"`);
  });

  test('submit with optional name and email succeeds', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => openFeedbackModal());
    await page.waitForSelector('#feedbackOverlay.open', { timeout: 6000 });

    await page.selectOption('#feedbackCategory', { value: 'inquiry' });
    await page.fill('#feedbackMessage', '[E2E] ทดสอบพร้อมชื่อและอีเมล');
    await page.fill('#feedbackName', 'E2E Tester');
    await page.fill('#feedbackEmail', 'e2e@test.com');
    await page.click('#feedbackOverlay .btn-g');

    await page.waitForSelector('.toast', { timeout: 10000 });
    // Modal should close on success
    const stillOpen = await page.evaluate(
      () => document.getElementById('feedbackOverlay')?.classList.contains('open')
    );
    expect(stillOpen).toBe(false);
    console.log('✅ Submit with name+email: modal closed (success)');
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
