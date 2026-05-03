const { test, expect, request } = require('@playwright/test');

const API_URL = 'https://khai-claude-production.up.railway.app';

test.describe('🪙 Coins packages API', () => {

  test('GET /api/coins/packages exposes correct brand name', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_URL}/api/coins/packages`);
    expect(res.ok()).toBeTruthy();

    const data = await res.json();
    expect(Array.isArray(data.packages)).toBe(true);
    expect(data.packages.length).toBeGreaterThan(0);
    expect(typeof data.promptpay).toBe('string');
    expect(typeof data.promptpay_name).toBe('string');

    // Brand name must NOT be the old wrong value 'ขายคล่อง' — see project_name memory
    expect(data.promptpay_name).not.toBe('ขายคล่อง');

    console.log(`✅ promptpay_name = "${data.promptpay_name}"`);
  });

});
