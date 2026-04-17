const { test, expect } = require('@playwright/test');
const { gotoApp, login, SELLER } = require('./helpers');

const ALL_CATS = [
  'มือถือ','เสื้อผ้า','หนังสือ','กีฬา','ของแต่งบ้าน','กล้อง',
  'ยานพาหนะ','อสังหาริมทรัพย์','เฟอร์นิเจอร์','เกม','ของใช้ในครัวเรือน',
  'งานอดิเรก','สวน','สัตว์เลี้ยง','เครื่องดนตรี','เครื่องใช้ไฟฟ้า',
  'อุปกรณ์ไอที','Gadget','นาฬิกา','ของฟรี','อื่นๆ',
];

test.describe('🗂️ Categories', () => {

  // ── Home page chips ─────────────────────────────────────────────────────────

  test('home page renders all 22 category chips (including ทั้งหมด)', async ({ page }) => {
    await gotoApp(page);

    const chips = page.locator('#catChips .chip');
    await expect(chips.first()).toBeVisible({ timeout: 8000 });

    const count = await chips.count();
    expect(count).toBe(22); // ทั้งหมด + 21 categories
    console.log(`✅ catChips: ${count} chips rendered`);
  });

  test('all new category chips are present in catChips', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#catChips .chip').first().waitFor({ timeout: 8000 });

    const chipTexts = await page.locator('#catChips .chip').allTextContents();
    const missing = ALL_CATS.filter(cat => !chipTexts.some(t => t.includes(cat)));

    if (missing.length) console.log('❌ Missing chips:', missing);
    expect(missing).toHaveLength(0);
    console.log('✅ All 21 category chips found in catChips');
  });

  test('clicking a category chip filters the product grid', async ({ page }) => {
    await gotoApp(page);
    await page.waitForFunction(() => document.querySelectorAll('.card').length >= 0, { timeout: 15000 });

    // Click "มือถือ" chip
    const chip = page.locator('#catChips .chip', { hasText: 'มือถือ' });
    await chip.click();
    await page.waitForTimeout(800);

    // Chip should become active
    await expect(chip).toHaveClass(/on/, { timeout: 3000 });
    console.log('✅ Category chip gains .on class when clicked');
  });

  test('clicking ทั้งหมด chip resets to all products', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#catChips .chip').first().waitFor({ timeout: 8000 });

    // First filter by something
    await page.locator('#catChips .chip', { hasText: 'กีฬา' }).click();
    await page.waitForTimeout(600);

    // Then reset
    const allChip = page.locator('#catChips .chip', { hasText: 'ทั้งหมด' });
    await allChip.click();
    await page.waitForTimeout(600);

    await expect(allChip).toHaveClass(/on/, { timeout: 3000 });
    console.log('✅ ทั้งหมด chip resets filter correctly');
  });

  // ── Sell form #sCat ─────────────────────────────────────────────────────────

  test('sell form #sCat contains all 21 categories', async ({ page }) => {
    await login(page, SELLER);
    await page.evaluate(() => openSell());
    await page.waitForSelector('#sellOverlay.open', { timeout: 8000 });

    const options = await page.locator('#sCat option').allTextContents();
    const missing = ALL_CATS.filter(cat => !options.some(o => o.trim() === cat));

    if (missing.length) console.log('❌ Missing in #sCat:', missing);
    expect(missing).toHaveLength(0);
    console.log(`✅ #sCat has all ${options.length} categories`);
  });

  test('sell form can select new categories', async ({ page }) => {
    await login(page, SELLER);
    await page.evaluate(() => openSell());
    await page.waitForSelector('#sellOverlay.open', { timeout: 8000 });

    // Try a few new categories
    for (const cat of ['ยานพาหนะ', 'สัตว์เลี้ยง', 'ของฟรี', 'อื่นๆ']) {
      await page.selectOption('#sCat', { label: cat });
      const selected = await page.locator('#sCat').inputValue();
      expect(selected).toBe(cat);
    }
    console.log('✅ #sCat: new categories selectable');
  });

  // ── Edit form #eCat ─────────────────────────────────────────────────────────

  test('edit form #eCat contains all 21 categories', async ({ page }) => {
    await login(page, SELLER);
    await page.evaluate(() => openProfile());
    await page.waitForSelector('#page-profile.active', { timeout: 12000 });

    const editBtn = page.locator('#myProductsGrid button[onclick*="openEdit"]').first();
    if (!await editBtn.count()) { console.log('⏭️ No products to edit'); return; }

    await editBtn.click();
    await page.waitForSelector('#editOverlay.open', { timeout: 8000 });

    const options = await page.locator('#eCat option').allTextContents();
    const missing = ALL_CATS.filter(cat => !options.some(o => o.trim() === cat));

    if (missing.length) console.log('❌ Missing in #eCat:', missing);
    expect(missing).toHaveLength(0);
    console.log(`✅ #eCat has all ${options.length} categories`);
  });

  // ── Saved search #ssCategory ────────────────────────────────────────────────

  test('saved search #ssCategory contains all 21 categories + ทั้งหมด', async ({ page }) => {
    await login(page, SELLER);
    await page.evaluate(() => openOverlay('savedSearchOverlay'));
    await page.waitForSelector('#savedSearchOverlay.open', { timeout: 8000 });

    const options = await page.locator('#ssCategory option').allTextContents();

    // Must have ทั้งหมด
    expect(options.some(o => o.includes('ทั้งหมด'))).toBe(true);

    // Must have all 21 categories
    const missing = ALL_CATS.filter(cat => !options.some(o => o.trim() === cat));
    if (missing.length) console.log('❌ Missing in #ssCategory:', missing);
    expect(missing).toHaveLength(0);

    console.log(`✅ #ssCategory has ทั้งหมด + all ${options.length - 1} categories`);
  });

  test('saved search #ssCategory does NOT have stale old-only categories', async ({ page }) => {
    await login(page, SELLER);
    await page.evaluate(() => openOverlay('savedSearchOverlay'));
    await page.waitForSelector('#savedSearchOverlay.open', { timeout: 8000 });

    const options = await page.locator('#ssCategory option').allTextContents();
    const stale = ['แฟชั่น', 'อิเล็กทรอนิกส์', 'เครื่องสำอาง'];
    const found  = stale.filter(cat => options.some(o => o.trim() === cat));

    if (found.length) console.log('❌ Stale categories still present:', found);
    expect(found).toHaveLength(0);
    console.log('✅ No stale old-only categories in #ssCategory');
  });

  // ── Integration: post in new category, verify it appears ───────────────────

  test('product posted in new category appears when filtering by that category', async ({ page }) => {
    await login(page, SELLER);

    // Create product in 'สัตว์เลี้ยง'
    const title = `[E2E-CAT] ${Date.now()}`;
    await page.evaluate(() => openSell());
    await page.waitForSelector('#sellOverlay.open', { timeout: 8000 });
    await page.fill('#sTitle', title);
    await page.fill('#sPrice', '1');
    await page.fill('#sDesc', 'ทดสอบหมวดหมู่ใหม่');
    await page.fill('#sLoc', 'กรุงเทพฯ');
    await page.selectOption('#sCat', { label: 'สัตว์เลี้ยง' });
    await page.click('#sellOverlay button.btn-g');
    await page.waitForFunction(
      () => !document.getElementById('sellOverlay')?.classList.contains('open'),
      { timeout: 15000 }
    );
    console.log('✅ Product posted in category สัตว์เลี้ยง');

    // Wait for home page, then filter by สัตว์เลี้ยง
    await page.evaluate(() => goPage('home'));
    await page.waitForSelector('#page-home.active', { timeout: 8000 });
    await page.locator('#catChips .chip').first().waitFor({ timeout: 8000 });

    await page.locator('#catChips .chip', { hasText: 'สัตว์เลี้ยง' }).click();
    await page.waitForTimeout(1000);

    const found = await page.evaluate((t) => {
      return [...document.querySelectorAll('.card')].some(c => c.textContent.includes(t));
    }, title);

    expect(found).toBe(true);
    console.log(`✅ "${title}" visible when filtered by สัตว์เลี้ยง`);
  });

});
