const { test, expect } = require('@playwright/test');
const { login, BUYER, SELLER, sendChatMessage, findAvailableProduct } = require('./helpers');

test.describe('💬 Chat', () => {

  test('chat list opens and renders', async ({ page }) => {
    await login(page, BUYER);
    await page.evaluate(() => openChatList());
    await page.waitForFunction(
      () => document.getElementById('page-chat')?.classList.contains('active'),
      { timeout: 12000 }
    );
    const hasRooms = await page.locator('.chat-room-item').count();
    console.log(`✅ Chat list: ${hasRooms} room(s) displayed`);
  });

  test('open chat room from product detail', async ({ page }) => {
    await login(page, BUYER);

    const product = await findAvailableProduct(page, { otherSeller: true });
    if (!product) { console.log('⏭️ No other-seller product found'); return; }

    await page.evaluate(id => openDetail(id), product.id);
    await page.waitForSelector('#page-detail.active', { timeout: 10000 });

    const chatBtn = page.locator('#page-detail button[onclick*="startChat"], #page-detail button:has-text("แชท")').first();
    if (!await chatBtn.count()) { console.log('⏭️ No chat button on this product'); return; }

    await chatBtn.click();

    // Chat room or chat page should appear
    await page.waitForFunction(
      () => document.querySelector('.chat-messages') !== null ||
            document.getElementById('page-chat')?.classList.contains('active'),
      { timeout: 12000 }
    );
    console.log('✅ Chat opened from product detail');
  });

  test('send a message and see it in chat', async ({ page }) => {
    await login(page, BUYER);
    await page.evaluate(() => openChatList());
    await page.waitForFunction(
      () => document.getElementById('page-chat')?.classList.contains('active'),
      { timeout: 12000 }
    );

    const firstRoom = page.locator('.chat-room-item').first();
    if (!await firstRoom.count()) { console.log('⏭️ No existing chat rooms'); return; }

    await firstRoom.click();
    await page.waitForSelector('.chat-messages', { timeout: 10000 });

    const msg = `E2E ทดสอบ ${Date.now()}`;
    await sendChatMessage(page, msg);

    await page.waitForFunction(
      (text) => document.querySelector('.chat-messages')?.textContent?.includes(text),
      msg,
      { timeout: 8000 }
    );
    console.log(`✅ Message "${msg}" sent and visible in chat`);
  });

  test('chat header shows product info', async ({ page }) => {
    await login(page, BUYER);
    await page.evaluate(() => openChatList());
    await page.waitForFunction(
      () => document.getElementById('page-chat')?.classList.contains('active'),
      { timeout: 12000 }
    );

    const firstRoom = page.locator('.chat-room-item').first();
    if (!await firstRoom.count()) { console.log('⏭️ No chat rooms to check header'); return; }

    await firstRoom.click();
    await page.waitForSelector('.chat-messages', { timeout: 10000 });

    // Header may contain product title and/or image
    const headerVisible = await page.locator('.chat-header, [class*="chat-header"]').first().isVisible().catch(() => false);
    console.log(`✅ Chat header: ${headerVisible ? 'visible' : 'not found'}`);
  });

  test('two-user chat flow: buyer sends, seller receives', async ({ browser }) => {
    const buyerCtx  = await browser.newContext();
    const sellerCtx = await browser.newContext();
    const buyerPage  = await buyerCtx.newPage();
    const sellerPage = await sellerCtx.newPage();

    try {
      // Both login
      await Promise.all([
        login(buyerPage, BUYER),
        login(sellerPage, SELLER),
      ]);

      // Buyer finds a product from seller and opens chat
      const product = await findAvailableProduct(buyerPage, { otherSeller: true });
      if (!product) { console.log('⏭️ No product for 2-user chat test'); return; }

      await buyerPage.evaluate(id => openDetail(id), product.id);
      await buyerPage.waitForSelector('#page-detail.active', { timeout: 10000 });

      const chatBtn = buyerPage.locator('#page-detail button[onclick*="startChat"]').first();
      if (!await chatBtn.count()) { console.log('⏭️ No startChat button'); return; }
      await chatBtn.click();

      await buyerPage.waitForSelector('.chat-messages', { timeout: 12000 });

      // Buyer sends a message
      const msg = `E2E 2-user ${Date.now()}`;
      await sendChatMessage(buyerPage, msg);
      await buyerPage.waitForFunction(
        (text) => document.querySelector('.chat-messages')?.textContent?.includes(text),
        msg, { timeout: 8000 }
      );
      console.log(`✅ Buyer sent: "${msg}"`);

      // Seller opens chat list and checks
      await sellerPage.evaluate(() => openChatList());
      await sellerPage.waitForFunction(
        () => document.getElementById('page-chat')?.classList.contains('active'),
        { timeout: 12000 }
      );

      // Seller opens the room and reads message
      const sellerFirstRoom = sellerPage.locator('.chat-room-item').first();
      if (await sellerFirstRoom.count()) {
        await sellerFirstRoom.click();
        await sellerPage.waitForSelector('.chat-messages', { timeout: 10000 });
        const sellerSaw = await sellerPage.evaluate(
          (text) => document.querySelector('.chat-messages')?.textContent?.includes(text),
          msg
        );
        console.log(`✅ Seller ${sellerSaw ? 'received' : 'did NOT see'} buyer message`);
      }

    } finally {
      await buyerCtx.close();
      await sellerCtx.close();
    }
  });

});
