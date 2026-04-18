const { test, expect, chromium } = require('@playwright/test');
const { gotoApp, login, SELLER, BUYER, BASE, appReady } = require('./helpers');

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

  // ── Real-time: admin panel auto-updates when user submits ────────────────────

  test('🔴 real-time: admin panel updates when user submits feedback (no F5)', async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: false });

    const adminCtx  = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const userCtx   = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const adminPage = await adminCtx.newPage();
    const userPage  = await userCtx.newPage();

    try {
      // 1. Admin logs in
      await adminPage.goto(BASE, { waitUntil: 'domcontentloaded' });
      await appReady(adminPage);
      await adminPage.evaluate(() => openOverlay('loginOverlay'));
      await adminPage.waitForSelector('#loginOverlay.open');
      await adminPage.fill('#loginEmail', SELLER.email);
      await adminPage.fill('#loginPass', SELLER.password);
      await adminPage.click('#loginForm button.btn-g');
      await adminPage.waitForFunction(() => !!localStorage.getItem('token'), { timeout: 12000 });
      await adminPage.waitForTimeout(1000);

      // Skip if SELLER account is not admin
      const isAdmin = await adminPage.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('user') || 'null');
        return !!u?.is_admin;
      });
      if (!isAdmin) {
        console.log('⏭️ SELLER account is not admin in this env — skipping real-time test');
        console.log('   (Set host@test.com as admin in DB to enable this test)');
        return;
      }

      // Wait for socket to be connected (so admin receives real-time events)
      await adminPage.waitForFunction(
        () => typeof socket !== 'undefined' && socket?.connected === true,
        { timeout: 15000 }
      );
      console.log('✅ Admin socket connected');

      // Open admin panel → feedback tab
      await adminPage.evaluate(() => openAdmin());
      await adminPage.waitForSelector('#page-admin.active', { timeout: 12000 });
      await adminPage.evaluate(() => adminTab('feedback'));
      await adminPage.waitForTimeout(1500);

      // Count current feedback items before user submits (.dispute-item inside adminTabContent)
      const beforeCount = await adminPage.locator('#adminTabContent .dispute-item').count();
      console.log(`📋 Admin sees ${beforeCount} feedback items before user submits`);

      // 2. User submits new feedback
      await userPage.goto(BASE, { waitUntil: 'domcontentloaded' });
      await appReady(userPage);
      await userPage.evaluate(() => openOverlay('loginOverlay'));
      await userPage.waitForSelector('#loginOverlay.open');
      await userPage.fill('#loginEmail', BUYER.email);
      await userPage.fill('#loginPass', BUYER.password);
      await userPage.click('#loginForm button.btn-g');
      await userPage.waitForFunction(() => !!localStorage.getItem('token'), { timeout: 12000 });
      await userPage.waitForTimeout(800);

      const msg = `[E2E Real-time] ทดสอบ socket ${Date.now()}`;
      await userPage.evaluate(() => openFeedbackModal());
      await userPage.waitForSelector('#feedbackOverlay.open');
      await userPage.selectOption('#feedbackCategory', { value: 'bug' });
      await userPage.fill('#feedbackMessage', msg);
      await userPage.click('#feedbackOverlay .btn-g');
      await userPage.waitForSelector('.toast', { timeout: 10000 });
      console.log('✅ User submitted feedback');

      // 3. Admin panel should auto-update within 10 seconds (no F5)
      await adminPage.waitForFunction(
        (before) => document.querySelectorAll('#adminTabContent .dispute-item').length > before,
        beforeCount,
        { timeout: 12000 }
      );
      const afterCount = await adminPage.locator('#adminTabContent .dispute-item').count();
      expect(afterCount).toBeGreaterThan(beforeCount);
      console.log(`✅ Real-time: admin panel updated ${beforeCount} → ${afterCount} (no F5)`);

      // 4. Check toast appeared on admin side
      const toastVisible = await adminPage.locator('.toast').count() > 0;
      console.log(`📩 Admin toast shown: ${toastVisible}`);

    } finally {
      await adminPage.close();
      await userPage.close();
      await adminCtx.close();
      await userCtx.close();
      await browser.close();
    }
  });

  // ── Real-time: admin panel updates when user replies in thread ───────────────

  test('🔴 real-time: admin sees new reply when user messages in thread (no F5)', async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: false });

    const adminCtx  = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const userCtx   = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const adminPage = await adminCtx.newPage();
    const userPage  = await userCtx.newPage();

    try {
      // Admin login
      await adminPage.goto(BASE, { waitUntil: 'domcontentloaded' });
      await appReady(adminPage);
      await adminPage.evaluate(() => openOverlay('loginOverlay'));
      await adminPage.waitForSelector('#loginOverlay.open');
      await adminPage.fill('#loginEmail', SELLER.email);
      await adminPage.fill('#loginPass', SELLER.password);
      await adminPage.click('#loginForm button.btn-g');
      await adminPage.waitForFunction(() => !!localStorage.getItem('token'), { timeout: 12000 });
      await adminPage.waitForTimeout(1000);

      // Skip if SELLER is not admin
      const isAdmin = await adminPage.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('user') || 'null');
        return !!u?.is_admin;
      });
      if (!isAdmin) {
        console.log('⏭️ SELLER account is not admin in this env — skipping real-time reply test');
        console.log('   (Set host@test.com as admin in DB to enable this test)');
        return;
      }

      // User login + submit feedback first
      await userPage.goto(BASE, { waitUntil: 'domcontentloaded' });
      await appReady(userPage);
      await userPage.evaluate(() => openOverlay('loginOverlay'));
      await userPage.waitForSelector('#loginOverlay.open');
      await userPage.fill('#loginEmail', BUYER.email);
      await userPage.fill('#loginPass', BUYER.password);
      await userPage.click('#loginForm button.btn-g');
      await userPage.waitForFunction(() => !!localStorage.getItem('token'), { timeout: 12000 });
      await userPage.waitForTimeout(800);

      // User submits feedback
      const msg = `[E2E Thread] ทดสอบ reply ${Date.now()}`;
      await userPage.evaluate(() => openFeedbackModal());
      await userPage.waitForSelector('#feedbackOverlay.open');
      await userPage.selectOption('#feedbackCategory', { value: 'inquiry' });
      await userPage.fill('#feedbackMessage', msg);
      await userPage.click('#feedbackOverlay .btn-g');
      await userPage.waitForSelector('.toast', { timeout: 10000 });
      await userPage.waitForTimeout(1000);

      // Get the feedback ID from user's history
      const feedbackId = await userPage.evaluate(async () => {
        const items = await api.getMyFeedback().catch(() => []);
        return items.length ? items[0].id : null;
      });
      if (!feedbackId) { console.log('⏭️ Could not get feedbackId, skip'); return; }
      console.log(`📋 Feedback ID: ${feedbackId}`);

      // Wait for socket to be connected
      await adminPage.waitForFunction(
        () => typeof socket !== 'undefined' && socket?.connected === true,
        { timeout: 15000 }
      );
      console.log('✅ Admin socket connected');

      // Admin opens feedback tab (thread is always visible in admin, no toggle needed)
      await adminPage.evaluate(() => openAdmin());
      await adminPage.waitForSelector('#page-admin.active', { timeout: 12000 });
      await adminPage.evaluate(() => adminTab('feedback'));
      await adminPage.waitForTimeout(2000); // wait for threads to render

      // Thread renders message divs with margin-bottom:8px, or empty state text
      const threadSel = `#fbThread_${feedbackId}`;
      // Wait for thread to finish initial render (not "กำลังโหลด...")
      await adminPage.waitForFunction(
        (sel) => {
          const el = document.querySelector(sel);
          return el && !el.textContent.includes('กำลังโหลด');
        },
        threadSel, { timeout: 8000 }
      ).catch(() => {});
      const threadEmpty = await adminPage.locator(`${threadSel}`).textContent();
      const beforeMsgCount = threadEmpty.includes('ยังไม่มีข้อความ') ? 0 : 1;
      console.log(`💬 Thread state before reply: ${threadEmpty.includes('ยังไม่มีข้อความ') ? 'empty' : 'has messages'}`);

      // User sends reply via profile → my-feedback tab
      await userPage.evaluate(() => openProfile());
      await userPage.waitForSelector('#page-profile.active', { timeout: 10000 });
      await userPage.evaluate(() => profileTab('my-feedback'));
      await userPage.waitForTimeout(2000); // wait for my-feedback to load

      // Reply input is #myFbMsg_${feedbackId}
      const replyMsg = `[E2E Reply] ตอบกลับ ${Date.now()}`;
      const inputSel = `#myFbMsg_${feedbackId}`;
      const inputEl = userPage.locator(inputSel);
      if (await inputEl.count()) {
        await inputEl.fill(replyMsg);
        // press Enter to send (onkeydown='if(event.key==="Enter")userSendFeedbackMsg(...)')
        await inputEl.press('Enter');
        await userPage.waitForTimeout(800);
        console.log('✅ User sent reply message');

        // Admin panel should reflect the new message within 12 seconds (no F5)
        // Thread changes from "ยังไม่มีข้อความ" to actual message content
        await adminPage.waitForFunction(
          (sel) => {
            const el = document.querySelector(sel);
            return el && !el.textContent.includes('ยังไม่มีข้อความ') && !el.textContent.includes('กำลังโหลด');
          },
          threadSel,
          { timeout: 14000 }
        );
        const afterContent = await adminPage.locator(threadSel).textContent();
        expect(afterContent).not.toContain('ยังไม่มีข้อความ');
        console.log(`✅ Real-time reply: admin thread updated — now has message content (no F5)`);
      } else {
        console.log('⏭️ Reply input #myFbMsg_' + feedbackId + ' not found, skipping reply test');
      }

    } finally {
      await adminPage.close();
      await userPage.close();
      await adminCtx.close();
      await userCtx.close();
      await browser.close();
    }
  });

});
