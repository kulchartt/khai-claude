const { test, expect } = require('@playwright/test');
const { HOST_USER, VIEW_USER, login, mockCamera } = require('./helpers');

test.describe('Live Stream', () => {

  test('host starts live, viewer joins, product shared, chat works', async ({ browser }) => {
    const hostCtx   = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const viewerCtx = await browser.newContext();
    const hostPage   = await hostCtx.newPage();
    const viewerPage = await viewerCtx.newPage();

    try {
      // --- Login ทั้งคู่ ---
      await Promise.all([
        login(hostPage, HOST_USER.email, HOST_USER.password),
        login(viewerPage, VIEW_USER.email, VIEW_USER.password),
      ]);
      console.log('✅ Both users logged in');

      // --- Host: mock camera แล้ว start live ---
      await mockCamera(hostPage);
      await hostPage.evaluate(() => openProfile());
      await hostPage.waitForSelector('#page-profile.active', { timeout: 10000 });

      hostPage.once('dialog', d => d.accept('E2E Live Test'));
      await hostPage.click('button:has-text("เริ่มไลฟ์")');
      await hostPage.waitForSelector('#liveHostOverlay.open', { timeout: 10000 });
      console.log('✅ Host: live overlay open');

      // รอ banner อัปเดตฝั่ง viewer
      await viewerPage.waitForTimeout(2500);

      // --- Viewer: join live ---
      const sellerId = await hostPage.evaluate(
        () => parseInt(document.getElementById('liveHostSellerId')?.value)
      );
      expect(sellerId).toBeGreaterThan(0);

      await viewerPage.evaluate((id) => joinLive(id), sellerId);
      await viewerPage.waitForSelector('#liveViewOverlay.open', { timeout: 8000 });
      console.log('✅ Viewer: joined live');

      // ตรวจ video element
      await expect(viewerPage.locator('#liveViewVideo')).toBeVisible();
      console.log('✅ Viewer: video element visible');

      // รอ WebRTC negotiate
      await viewerPage.waitForTimeout(3000);

      // --- Host: share product ---
      await hostPage.click('button:has-text("แชร์สินค้า")');
      await hostPage.waitForSelector('#liveProductPicker', { state: 'visible', timeout: 5000 });

      const shareBtn = hostPage.locator('#liveProductPicker button:has-text("แชร์")').first();
      await expect(shareBtn).toBeVisible({ timeout: 5000 });
      await shareBtn.click();

      // ตรวจ toast ฝั่ง host
      await hostPage.waitForFunction(
        () => document.querySelector('.toast')?.textContent?.includes('แชร์สินค้า'),
        { timeout: 5000 }
      );
      console.log('✅ Host: product share toast shown');

      // --- Viewer: ตรวจ popup โผล่ ---
      await viewerPage.waitForSelector('#liveProductPopup', { state: 'visible', timeout: 10000 });
      const popup = viewerPage.locator('#liveProductPopup');
      await expect(popup.locator('text=สินค้าจากไลฟ์')).toBeVisible();
      await expect(popup.locator('button:has-text("ซื้อเลย")')).toBeVisible();
      await expect(popup.locator('button:has-text("×")')).toBeVisible();
      console.log('✅ Viewer: TikTok product popup visible with all elements');

      // กด × ปิด popup
      await popup.locator('button:has-text("×")').click();
      await expect(popup).toBeHidden({ timeout: 3000 });
      console.log('✅ Viewer: popup dismissed with × button');

      // --- Chat: viewer ส่ง → host เห็น ---
      await viewerPage.fill('#liveViewChatInput', 'สวัสดี E2E 👋');
      await viewerPage.press('#liveViewChatInput', 'Enter');
      await viewerPage.waitForTimeout(1500);

      const hostChatBox = hostPage.locator('#liveChatBox');
      await expect(hostChatBox).toContainText('สวัสดี E2E', { timeout: 8000 });
      console.log('✅ Chat: viewer message arrived at host');

      // ตรวจไม่ duplicate
      const count = await hostChatBox.evaluate(el =>
        [...el.querySelectorAll('div')].filter(d => d.textContent.includes('สวัสดี E2E')).length
      );
      expect(count).toBe(1);
      console.log('✅ Chat: no duplicate messages');

      // --- Host: ส่ง chat → viewer เห็น ---
      await hostPage.fill('#liveChatInputHost', 'ตอบจาก host 🎉');
      await hostPage.press('#liveChatInputHost', 'Enter');
      await viewerPage.waitForTimeout(1500);

      const viewerChatBox = viewerPage.locator('#liveViewChatBox');
      await expect(viewerChatBox).toContainText('ตอบจาก host', { timeout: 8000 });
      console.log('✅ Chat: host message arrived at viewer');

      // --- Viewer: leave ---
      await viewerPage.click('#liveViewOverlay .mclose');
      await expect(viewerPage.locator('#liveViewOverlay')).toBeHidden({ timeout: 5000 });
      console.log('✅ Viewer: left live cleanly');

      // --- Host: stop live ---
      await hostPage.click('button:has-text("จบไลฟ์")');
      await expect(hostPage.locator('#liveHostOverlay')).toBeHidden({ timeout: 5000 });
      console.log('✅ Host: live ended');

    } finally {
      await hostCtx.close();
      await viewerCtx.close();
    }
  });

  test('viewer gets notified when host disconnects unexpectedly', async ({ browser }) => {
    const hostCtx   = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const viewerCtx = await browser.newContext();
    const hostPage   = await hostCtx.newPage();
    const viewerPage = await viewerCtx.newPage();

    try {
      await Promise.all([
        login(hostPage, HOST_USER.email, HOST_USER.password),
        login(viewerPage, VIEW_USER.email, VIEW_USER.password),
      ]);

      await mockCamera(hostPage);
      await hostPage.evaluate(() => openProfile());
      await hostPage.waitForSelector('#page-profile.active', { timeout: 10000 });
      hostPage.once('dialog', d => d.accept('Disconnect Test'));
      await hostPage.click('button:has-text("เริ่มไลฟ์")');
      await hostPage.waitForSelector('#liveHostOverlay.open', { timeout: 10000 });

      await viewerPage.waitForTimeout(2000);
      const sellerId = await hostPage.evaluate(
        () => parseInt(document.getElementById('liveHostSellerId')?.value)
      );
      await viewerPage.evaluate((id) => joinLive(id), sellerId);
      await viewerPage.waitForSelector('#liveViewOverlay.open', { timeout: 8000 });
      console.log('✅ Viewer joined');

      // Host ปิด context (simulate disconnect)
      await hostCtx.close();
      console.log('✅ Host disconnected');

      // Viewer overlay ควรปิดอัตโนมัติ
      await expect(viewerPage.locator('#liveViewOverlay')).toBeHidden({ timeout: 12000 });
      console.log('✅ Viewer: overlay closed after host disconnect');

    } finally {
      await viewerCtx.close().catch(() => {});
    }
  });

});
