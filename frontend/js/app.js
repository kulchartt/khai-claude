const EMOJIS = {มือถือ:'📱',เสื้อผ้า:'👗',หนังสือ:'📚',กีฬา:'⚽',ของแต่งบ้าน:'🏠',กล้อง:'📷'};
const CMAP = {'มือสองใหม่':'cond-new','สภาพดี':'cond-good','สภาพพอใช้':'cond-fair'};

let state = {
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token') || null,
  cat: 'ทั้งหมด',
  cartCount: 0,
  wlCount: 0,
};

function toast(msg, color) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = color || '#1a1a18';
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}

function goPage(p) {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.getElementById('page-' + p).classList.add('active');
  window.scrollTo(0, 0);
}

function openOverlay(id) { document.getElementById(id).classList.add('open'); }
function closeOverlay(id) { document.getElementById(id).classList.remove('open'); }

function updateNav() {
  const n = document.getElementById('navUser');
  if (state.user) {
    n.innerHTML = `<div class="avatar" onclick="openProfile()" title="โปรไฟล์">${state.user.name.slice(0,2).toUpperCase()}</div>`;
  } else {
    n.innerHTML = `<button class="btn btn-sm" onclick="openOverlay('loginOverlay')">เข้าสู่ระบบ</button>`;
  }
}

function productImg(p) {
  if (p.image_url) {
    return `<img src="${CONFIG.API_URL}${p.image_url}" alt="${p.title}" onerror="this.parentNode.innerHTML='<span class=\\'emoji\\'>${EMOJIS[p.cat]||'📦'}</span>'"/>`;
  }
  return `<span class="emoji">${EMOJIS[p.category||p.cat]||'📦'}</span>`;
}

function renderCards(list, containerId) {
  const g = document.getElementById(containerId);
  if (!list.length) { g.innerHTML = '<div class="empty-msg">ไม่พบสินค้า</div>'; return; }
  g.innerHTML = list.map(p => `
    <div class="card" onclick="openDetail(${p.id})">
      <div class="card-img">${productImg(p)}</div>
      <div class="card-body">
        <div class="card-title">${p.title}</div>
        <div class="card-price">฿${Number(p.price).toLocaleString()}</div>
        <div class="card-foot">
          <span class="cond ${CMAP[p.condition||p.cond]||''}">${p.condition||p.cond}</span>
          <span class="seller-nm">${p.seller_name||p.location||''}</span>
        </div>
      </div>
    </div>`).join('');
}

async function loadProducts() {
  const q = document.getElementById('searchQ').value;
  const minPrice = document.getElementById('minP').value;
  const maxPrice = document.getElementById('maxP').value;
  const sort = document.getElementById('sortSel').value;
  document.getElementById('productGrid').innerHTML = '<div class="loading">กำลังโหลดสินค้า...</div>';
  try {
    const params = {};
    if (state.cat !== 'ทั้งหมด') params.cat = state.cat;
    if (q) params.q = q;
    if (minPrice) params.minPrice = minPrice;
    if (maxPrice) params.maxPrice = maxPrice;
    if (sort) params.sort = sort;
    const products = await api.getProducts(params);
    document.getElementById('statCount').textContent = products.length + '+';
    renderCards(products, 'productGrid');
  } catch (e) {
    document.getElementById('productGrid').innerHTML = '<div class="empty-msg">โหลดสินค้าไม่สำเร็จ กรุณาลองใหม่</div>';
  }
}

function applyFilter() { loadProducts(); }

function setCat(cat, el) {
  state.cat = cat;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
  el.classList.add('on');
  loadProducts();
}

async function openDetail(id) {
  try {
    const p = await api.getProduct(id);
    const wl = state.wlIds || [];
    const inWl = wl.includes(id);
    document.getElementById('detailContent').innerHTML = `
      <div class="detail-hero">
        <div class="detail-img">${productImg(p)}</div>
        <div class="detail-info">
          <h1 class="detail-title">${p.title}</h1>
          <div class="detail-price">฿${Number(p.price).toLocaleString()}</div>
          <div class="detail-actions">
            <button class="btn btn-g" onclick="addToCart(${p.id})">🛒 เพิ่มลงตะกร้า</button>
            <button class="btn wl-btn ${inWl?'liked':''}" id="wlBtn_${p.id}" onclick="toggleWl(${p.id})">${inWl?'❤️':'🤍'}</button>
          </div>
          <div class="detail-meta">
            <div class="meta-box"><div class="meta-l">สภาพ</div><div class="meta-v">${p.condition}</div></div>
            <div class="meta-box"><div class="meta-l">หมวดหมู่</div><div class="meta-v">${p.category}</div></div>
            <div class="meta-box"><div class="meta-l">จังหวัด</div><div class="meta-v">${p.location||'ไม่ระบุ'}</div></div>
            <div class="meta-box"><div class="meta-l">รหัสสินค้า</div><div class="meta-v">#${String(p.id).padStart(4,'0')}</div></div>
          </div>
        </div>
      </div>
      <div class="detail-body">
        <h3>รายละเอียดสินค้า</h3>
        <p>${p.description||'ไม่มีรายละเอียดเพิ่มเติม'}</p>
        <h3>ผู้ขาย</h3>
        <div class="seller-card">
          <div class="s-avatar">${(p.seller_name||'?').slice(0,2).toUpperCase()}</div>
          <div>
            <div class="s-name">${p.seller_name||'ไม่ระบุ'}</div>
            <div class="s-sub">${p.location||'ไม่ระบุจังหวัด'}</div>
            <div class="s-rating">★ ${p.seller_rating||5.0} (${p.seller_reviews||0} รีวิว)</div>
          </div>
        </div>
      </div>`;
    goPage('detail');
  } catch (e) { toast('โหลดสินค้าไม่สำเร็จ'); }
}

async function addToCart(id) {
  if (!state.user) { toast('กรุณาเข้าสู่ระบบก่อน'); openOverlay('loginOverlay'); return; }
  try {
    await api.addCart(id);
    state.cartCount++;
    document.getElementById('cartBadge').textContent = state.cartCount;
    toast('เพิ่มลงตะกร้าแล้ว! 🛒', '#1D9E75');
  } catch (e) { toast(e.message); }
}

async function toggleWl(id) {
  if (!state.user) { openOverlay('loginOverlay'); return; }
  try {
    const res = await api.toggleWishlist(id);
    if (!state.wlIds) state.wlIds = [];
    if (res.liked) {
      state.wlIds.push(id); state.wlCount++;
    } else {
      state.wlIds = state.wlIds.filter(x => x !== id); state.wlCount = Math.max(0, state.wlCount-1);
    }
    document.getElementById('wlBadge').textContent = state.wlCount;
    const btn = document.getElementById('wlBtn_'+id);
    if (btn) { btn.textContent = res.liked?'❤️':'🤍'; btn.classList.toggle('liked', res.liked); }
    toast(res.message);
  } catch (e) { toast(e.message); }
}

async function openWishlist() {
  if (!state.user) { openOverlay('loginOverlay'); return; }
  try {
    const items = await api.getWishlist();
    renderCards(items.map(i => ({...i, id:i.product_id, category:i.cat||i.category})), 'wishlistGrid');
    if (!items.length) document.getElementById('wishlistGrid').innerHTML = '<div class="empty-msg">ยังไม่มีสินค้าในรายการโปรด<br>กดหัวใจที่สินค้าเพื่อเพิ่ม</div>';
    goPage('wishlist');
  } catch (e) { toast(e.message); }
}

async function openCart() {
  if (!state.user) { openOverlay('loginOverlay'); return; }
  try {
    const items = await api.getCart();
    const c = document.getElementById('cartContent');
    if (!items.length) { c.innerHTML = '<div class="empty-msg">ตะกร้าว่างเปล่า<br><br><button class="btn btn-g" onclick="goPage(\'home\')">ดูสินค้า</button></div>'; goPage('cart'); return; }
    const total = items.reduce((s, x) => s + x.price * x.qty, 0);
    c.innerHTML = items.map(x => `
      <div class="cart-item">
        <div class="cart-thumb">${x.image_url?`<img src="${CONFIG.API_URL}${x.image_url}" alt="${x.title}"/>`:EMOJIS[x.category]||'📦'}</div>
        <div class="cart-info">
          <div class="cart-name">${x.title}</div>
          <div class="cart-price">฿${Number(x.price).toLocaleString()} × ${x.qty}</div>
        </div>
        <div class="cart-qty">
          <button class="btn btn-sm" onclick="changeQty(${x.product_id},${x.qty-1})">-</button>
          <span>${x.qty}</span>
          <button class="btn btn-sm" onclick="changeQty(${x.product_id},${x.qty+1})">+</button>
          <button class="btn btn-sm btn-danger" onclick="removeCartItem(${x.product_id})">✕</button>
        </div>
      </div>`).join('') + `
      <div class="cart-summary">
        <div class="summary-row"><span>รายการ ${items.length} รายการ</span><span>฿${total.toLocaleString()}</span></div>
        <div class="summary-row"><span>ค่าจัดส่ง</span><span>ฟรี</span></div>
        <div class="summary-total"><span>รวมทั้งหมด</span><span>฿${total.toLocaleString()}</span></div>
        <button class="btn btn-g full" style="margin-top:16px" onclick="doCheckout()">ยืนยันชำระเงิน</button>
      </div>`;
    goPage('cart');
  } catch (e) { toast(e.message); }
}

async function changeQty(pid, qty) {
  try { await api.updateCartQty(pid, qty); state.cartCount = Math.max(0, state.cartCount + (qty <= 0 ? -1 : 0)); document.getElementById('cartBadge').textContent = state.cartCount; openCart(); }
  catch (e) { toast(e.message); }
}
async function removeCartItem(pid) {
  try { await api.removeCart(pid); state.cartCount = Math.max(0, state.cartCount - 1); document.getElementById('cartBadge').textContent = state.cartCount; openCart(); }
  catch (e) { toast(e.message); }
}
async function doCheckout() {
  try {
    const res = await api.checkout();
    state.cartCount = 0; document.getElementById('cartBadge').textContent = 0;
    goPage('home'); toast('ชำระเงินสำเร็จ! ขอบคุณที่ใช้บริการ 🎉', '#1D9E75');
  } catch (e) { toast(e.message); }
}

async function openProfile() {
  if (!state.user) { openOverlay('loginOverlay'); return; }
  try {
    const me = await api.getMe();
    const myItems = await api.getMyProducts();
    document.getElementById('profileContent').innerHTML = `
      <div class="profile-header">
        <div class="p-avatar">${me.name.slice(0,2).toUpperCase()}</div>
        <div style="flex:1">
          <div class="p-name">${me.name}</div>
          <div class="p-email">${me.email}</div>
          <div class="p-stats">
            <div class="stat"><div class="stat-n" style="font-size:20px">${myItems.length}</div><div class="stat-l">สินค้าที่ลงขาย</div></div>
            <div class="stat"><div class="stat-n" style="font-size:20px">${state.wlCount}</div><div class="stat-l">รายการโปรด</div></div>
            <div class="stat"><div class="stat-n" style="font-size:20px">${me.rating||5.0}★</div><div class="stat-l">คะแนน</div></div>
          </div>
        </div>
      </div>
      <div class="section-title">
        <span>สินค้าที่ฉันลงขาย (${myItems.length})</span>
        <button class="btn btn-sm btn-g" onclick="openSell()">+ ลงขายเพิ่ม</button>
      </div>
      <div class="product-grid" id="myProductsGrid"></div>
      <div style="margin-top:24px">
        <button class="btn btn-danger full" onclick="doLogout()">ออกจากระบบ</button>
      </div>`;
    renderCards(myItems, 'myProductsGrid');
    if (!myItems.length) document.getElementById('myProductsGrid').innerHTML = '<div class="empty-msg">ยังไม่มีสินค้า<br><button class="btn btn-g" style="margin-top:12px" onclick="openSell()">+ ลงขายสินค้าแรก</button></div>';
    goPage('profile');
  } catch (e) { toast(e.message); }
}

function switchTab(t) {
  document.getElementById('loginForm').classList.toggle('hidden', t !== 'login');
  document.getElementById('regForm').classList.toggle('hidden', t !== 'reg');
  document.getElementById('tabLogin').classList.toggle('on', t === 'login');
  document.getElementById('tabReg').classList.toggle('on', t === 'reg');
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  if (!email || !pass) { toast('กรุณากรอกข้อมูลให้ครบ'); return; }
  try {
    const res = await api.login(email, pass);
    localStorage.setItem('token', res.token);
    localStorage.setItem('user', JSON.stringify(res.user));
    state.user = res.user; state.token = res.token;
    closeOverlay('loginOverlay');
    updateNav();
    toast('ยินดีต้อนรับ ' + res.user.name + '!', '#1D9E75');
    await syncBadges();
  } catch (e) { toast(e.message); }
}

async function doRegister() {
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass = document.getElementById('regPass').value;
  if (!name || !email || !pass) { toast('กรุณากรอกข้อมูลให้ครบ'); return; }
  try {
    const res = await api.register(name, email, pass);
    localStorage.setItem('token', res.token);
    localStorage.setItem('user', JSON.stringify(res.user));
    state.user = res.user; state.token = res.token;
    closeOverlay('loginOverlay');
    updateNav();
    toast('สมัครสมาชิกสำเร็จ! ยินดีต้อนรับ ' + name + ' 🎉', '#1D9E75');
  } catch (e) { toast(e.message); }
}

function doLogout() {
  localStorage.removeItem('token'); localStorage.removeItem('user');
  state.user = null; state.token = null; state.cartCount = 0; state.wlCount = 0;
  document.getElementById('cartBadge').textContent = 0;
  document.getElementById('wlBadge').textContent = 0;
  updateNav(); goPage('home');
  toast('ออกจากระบบแล้ว');
}

function openSell() {
  if (!state.user) { toast('กรุณาเข้าสู่ระบบก่อนลงขาย'); openOverlay('loginOverlay'); return; }
  openOverlay('sellOverlay');
}

async function doSell() {
  const title = document.getElementById('sTitle').value.trim();
  const price = document.getElementById('sPrice').value;
  if (!title || !price) { toast('กรุณากรอกชื่อสินค้าและราคา'); return; }
  const fd = new FormData();
  fd.append('title', title);
  fd.append('price', price);
  fd.append('category', document.getElementById('sCat').value);
  fd.append('condition', document.getElementById('sCond').value);
  fd.append('description', document.getElementById('sDesc').value);
  fd.append('location', document.getElementById('sLoc').value);
  const img = document.getElementById('sImg').files[0];
  if (img) fd.append('image', img);
  try {
    await api.createProduct(fd);
    closeOverlay('sellOverlay');
    ['sTitle','sPrice','sDesc','sLoc'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('sImg').value = '';
    toast('ลงขายสินค้าสำเร็จ! 🎉', '#1D9E75');
    loadProducts();
  } catch (e) { toast(e.message); }
}

async function syncBadges() {
  if (!state.user) return;
  try {
    const [cart, wl] = await Promise.all([api.getCart(), api.getWishlist()]);
    state.cartCount = cart.reduce((s, x) => s + x.qty, 0);
    state.wlCount = wl.length;
    state.wlIds = wl.map(x => x.product_id);
    document.getElementById('cartBadge').textContent = state.cartCount;
    document.getElementById('wlBadge').textContent = state.wlCount;
  } catch {}
}

async function init() {
  updateNav();
  await loadProducts();
  if (state.user) await syncBadges();
}

init();
