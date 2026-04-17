const BASE = 'https://kulchartt.github.io/khai-claude/';

const SELLER = { email: 'host@test.com',   password: 'test1234' };
const BUYER  = { email: 'viewer@test.com',  password: 'test1234' };

/** Wait for app.js to finish initialising */
async function appReady(page) {
  await page.waitForFunction(() => typeof openOverlay === 'function', { timeout: 15000 });
  await page.waitForTimeout(700);
}

/** Navigate to BASE and wait for app */
async function gotoApp(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await appReady(page);
}

/** Login and wait for token */
async function login(page, user) {
  await gotoApp(page);
  await page.evaluate(() => openOverlay('loginOverlay'));
  await page.waitForSelector('#loginOverlay.open', { timeout: 5000 });
  await page.fill('#loginEmail', user.email);
  await page.fill('#loginPass', user.password);
  await page.click('#loginForm button.btn-g');
  await page.waitForFunction(() => !!localStorage.getItem('token'), { timeout: 12000 });
  await page.waitForTimeout(500);
}

/** Find an available product NOT owned by the current logged-in user */
async function findAvailableProduct(page, opts = {}) {
  return page.evaluate(async (opts) => {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const products = await api.getProducts({ limit: 50 }).catch(() => []);
    return products.find(p =>
      p.status === 'available' &&
      (!opts.otherSeller || p.seller_id !== user?.id) &&
      (!opts.shippingOnly || p.delivery_method !== 'pickup')
    ) || null;
  }, opts);
}

/** Create a product as the currently logged-in seller, returns the product object */
async function createTestProduct(page, title) {
  title = title || `[E2E] ทดสอบ ${Date.now()}`;
  await page.evaluate(() => openSell());
  await page.waitForSelector('#sellOverlay.open', { timeout: 8000 });
  await page.fill('#sTitle', title);
  await page.fill('#sPrice', '99');
  await page.fill('#sDesc', 'สินค้า E2E อัตโนมัติ ไม่ต้องสนใจ');
  await page.fill('#sLoc', 'กรุงเทพฯ');
  await page.click('#sellOverlay button.btn-g');
  await page.waitForFunction(
    () => !document.getElementById('sellOverlay')?.classList.contains('open'),
    { timeout: 15000 }
  );
  await page.waitForTimeout(800);
  // Fetch the newly created product
  return page.evaluate(async (t) => {
    const products = await api.getProducts({ limit: 50 }).catch(() => []);
    return products.find(p => p.title === t) || null;
  }, title);
}

/** Send message to contenteditable or input #msgInput */
async function sendChatMessage(page, text) {
  const input = page.locator('#msgInput');
  await input.waitFor({ timeout: 6000 });
  const isEditable = await input.evaluate(el => el.contentEditable === 'true');
  if (isEditable) {
    await input.click();
    await input.pressSequentially(text);
    await page.keyboard.press('Enter');
  } else {
    await input.fill(text);
    await page.keyboard.press('Enter');
  }
}

/** Dismiss any open dialog automatically */
function autoAcceptDialogs(page) {
  page.on('dialog', d => d.accept());
}

module.exports = {
  BASE, SELLER, BUYER,
  appReady, gotoApp, login,
  findAvailableProduct, createTestProduct,
  sendChatMessage, autoAcceptDialogs,
};
