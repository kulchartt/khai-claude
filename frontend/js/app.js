console.log('%c app.js v20260418b ', 'background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px');
const EMOJIS={มือถือ:'📱',เสื้อผ้า:'👗',หนังสือ:'📚',กีฬา:'⚽',ของแต่งบ้าน:'🏠',กล้อง:'📷'};
const CMAP={'มือหนึ่ง (ใหม่)':'cond-brand-new','เหมือนใหม่':'cond-new','สภาพดี':'cond-good','สภาพพอใช้':'cond-fair','มือสองใหม่':'cond-new'};
const NICONS={chat:'💬',review:'⭐',order:'📦',system:'📢'};
const QUICK_REPLIES=['ยังมีอยู่ไหมครับ?','ลดราคาได้ไหมครับ?','นัดรับได้ไหมครับ?','ส่งพัสดุได้ไหมครับ?','รีวิวดีไหมครับ?','สภาพจริงเป็นยังไงครับ?'];

let state={user:JSON.parse(localStorage.getItem('user')||'null'),token:localStorage.getItem('token')||null,cat:'ทั้งหมด',cartCount:0,wlCount:0,notifCount:0,chatCount:0,wlIds:[],starRating:0};
let socket=null,currentRoomId=null;
let _productPage=1,_productLoading=false,_productDone=false;
const _productLimit=20;

function toast(msg,color){const t=document.getElementById('toast');t.textContent=msg;t.style.background=color||'#1a1a18';t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2800);}
function goPage(p){
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.getElementById('page-'+p).classList.add('active');
  window.scrollTo(0,0);
  if(p==='home'){
    // เคลียร์ hash โดยไม่ trigger hashchange event
    history.replaceState(null,'',window.location.pathname+window.location.search);
    loadProducts();
    loadTrending();
    loadBundleSection();
  }
}
function openOverlay(id){document.getElementById(id).classList.add('open');}
function closeOverlay(id){document.getElementById(id).classList.remove('open');}
function updateBadge(id,count){const el=document.getElementById(id);if(!el)return;el.textContent=count;el.classList.toggle('hidden',count<=0);}

function updateNav(){
  const n=document.getElementById('navUser');
  if(state.user){
    const admin=state.user.is_admin?`<button class="btn btn-sm" style="margin-left:4px" onclick="openAdmin()">🛡️</button>`:'';
    n.innerHTML=`<div style="display:flex;align-items:center;gap:6px"><div class="avatar" onclick="openProfile()">${state.user.name.slice(0,2).toUpperCase()}</div>${admin}</div>`;
  }else{n.innerHTML=`<button class="btn btn-sm" onclick="openOverlay('loginOverlay')">เข้าสู่ระบบ</button>`;}
}

function imgSrc(url){if(!url)return '';return url.startsWith('http')?url:CONFIG.API_URL+url;}
function productImg(p){
  const url=p.image_url;
  const emoji=EMOJIS[p.category||p.cat]||'📦';
  if(url)return `<img src="${imgSrc(url)}" alt="${p.title}" loading="lazy"
    onload="this.parentNode.classList.add('loaded')"
    onerror="this.parentNode.classList.add('loaded');this.parentNode.innerHTML='<span class=\\'emoji\\'>${emoji}</span>'"/>`;
  return `<span class="emoji">${emoji}</span>`;
}
const DELIVERY_ICON={pickup:'🤝',shipping:'📦',both:'📦🤝'};
function renderCards(list,cid){const g=document.getElementById(cid);if(!g)return;if(!list.length){g.innerHTML='<div class="empty-msg">ไม่พบสินค้า</div>';return;}const now=Date.now();g.innerHTML=list.map(p=>{const flashActive=p.flash_price&&p.flash_end&&new Date(p.flash_end)>now;const priceHtml=flashActive?`<div class="card-price">฿${Number(p.flash_price).toLocaleString()} <span class="original-price">฿${Number(p.price).toLocaleString()}</span></div>`:(p.original_price?`<div class="card-price">฿${Number(p.price).toLocaleString()} <span class="original-price">฿${Number(p.original_price).toLocaleString()}</span></div>`:`<div class="card-price">฿${Number(p.price).toLocaleString()}</div>`);const flashBadge=flashActive?`<span class="flash-badge">⚡</span>`:'';const dropBadge=(!flashActive&&p.original_price)?'<span class="price-drop-badge">ลดราคา</span>':'';const reservedBadge=p.status==='reserved'?'<span class="reserved-badge">กำลังถูกจอง</span>':'';const delIcon=p.delivery_method&&p.delivery_method!=='both'?`<span class="delivery-icon">${DELIVERY_ICON[p.delivery_method]||''}</span>`:'';const flashTimer=flashActive?`<div class="flash-timer" data-flash-end="${p.flash_end}"></div>`:'';return `<div class="card" onclick="openDetail(${p.id})"><div class="card-img">${productImg(p)}${flashBadge}${dropBadge}${reservedBadge}</div><div class="card-body"><div class="card-title">${p.title}</div>${priceHtml}${flashTimer}<div class="card-foot"><span class="cond ${CMAP[p.condition||p.cond]||''}">${p.condition||p.cond}</span><span class="seller-nm">${p.seller_name||p.location||''}</span>${delIcon}</div></div></div>`;}).join('');startFlashCountdowns();}

function applyFilter(){loadProducts();}
function setCat(cat,el){state.cat=cat;document.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));el.classList.add('on');loadProducts();}

async function openDetail(id){
  try{
    const[p,rv]=await Promise.all([api.getProduct(id),api.getReviews(id)]);
    const inWl=state.wlIds.includes(id),isOwner=state.user&&state.user.id===p.seller_id;
    window.location.hash='product-'+id;
    addRecentlyViewed(p);
    document.getElementById('detailContent').innerHTML=`
      <div class="detail-hero">
        <div>${buildGallery(p)}</div>
        <div class="detail-info">
          <h1 class="detail-title">${p.title}</h1>
          ${(()=>{const now=Date.now();const flashActive=p.flash_price&&p.flash_end&&new Date(p.flash_end)>now;if(flashActive)return `<div class="detail-price" style="color:#dc2626">฿${Number(p.flash_price).toLocaleString()} <span class="original-price" style="font-size:16px">฿${Number(p.price).toLocaleString()}</span> <span class="flash-badge">⚡ Flash Sale</span></div><div class="flash-timer" data-flash-end="${p.flash_end}" style="font-size:13px;color:#dc2626;margin:-8px 0 8px"></div>`;if(p.original_price)return `<div class="detail-price">฿${Number(p.price).toLocaleString()} <span class="original-price" style="font-size:16px">฿${Number(p.original_price).toLocaleString()}</span> <span class="price-drop-badge">ลดราคา</span></div>`;return `<div class="detail-price">฿${Number(p.price).toLocaleString()}</div>`;})()}
          ${p.seller_holiday_mode&&!isOwner?`<div class="holiday-notice">🏖️ ร้านปิดชั่วคราว — ไม่สามารถสั่งซื้อได้ในขณะนี้</div>`:''}
          <div class="detail-actions">
            ${!isOwner&&p.status==='available'&&!p.seller_holiday_mode?`<button class="btn btn-g" onclick="addToCart(${p.id})">🛒 ใส่ตะกร้า</button>`:''}
            ${!isOwner&&p.status==='available'&&!p.seller_holiday_mode?`<button class="btn btn-reserve" onclick="doReserve(${p.id})">🔖 จอง</button>`:''}
            ${!isOwner&&p.status==='reserved'?`<span style="font-size:13px;color:#d97706;font-weight:600;padding:8px 0;display:block">⏳ กำลังถูกจอง</span>`:''}
            ${!isOwner?`<button class="btn" onclick="startChat(${p.seller_id},${p.id})">💬 แชทผู้ขาย</button>`:''}
            ${!isOwner&&p.status==='available'?`<button class="btn btn-available" onclick="askAvailable(${p.seller_id},${p.id},'${p.title.replace(/'/g,"\\'")}')">🙋 ยังมีอยู่ไหม?</button>`:''}
            <button class="btn wl-btn ${inWl?'liked':''}" id="wlBtn_${p.id}" onclick="toggleWl(${p.id})">${inWl?'❤️':'🤍'}</button>
            ${!isOwner&&p.status==='available'?`<button class="btn btn-offer" onclick="openOfferModal(${p.id},'${p.title.replace(/'/g,"\\'")}',${p.price})">💰 เสนอราคา</button>`:''}
            ${isOwner?`<button class="btn" onclick="openEditModal(${p.id})">✏️ แก้ไข</button><button class="btn btn-danger" onclick="confirmDeleteProduct(${p.id})">🗑️ ลบสินค้า</button>${p.status==='available'?`<button class="btn" style="background:#fef9c3;color:#854d0e;border-color:#fcd34d" onclick="openFlashModal(${p.id},${p.price})">⚡ Flash Sale</button>`:''}`:'' }
            <button class="share-btn" onclick="shareProduct(${p.id},'${p.title.replace(/'/g,"\\'")}')">🔗 แชร์</button>
            ${!isOwner?`<button class="report-btn" onclick="openReportModal(${p.id})">🚩 แจ้ง</button>`:''}
          </div>
          <div class="detail-meta">
            <div class="meta-box"><div class="meta-l">สภาพ</div><div class="meta-v">${p.condition}</div></div>
            <div class="meta-box"><div class="meta-l">หมวดหมู่</div><div class="meta-v">${p.category}</div></div>
            <div class="meta-box"><div class="meta-l">จังหวัด</div><div class="meta-v">${p.location||'ไม่ระบุ'}</div></div>
            <div class="meta-box"><div class="meta-l">ส่งมอบ</div><div class="meta-v">${{pickup:'🤝 นัดรับ',shipping:'📦 ส่งพัสดุ',both:'📦🤝 ส่งหรือนัดรับ'}[p.delivery_method||'both']}</div></div>
            <div class="meta-box"><div class="meta-l">รหัสสินค้า</div><div class="meta-v">#${String(p.id).padStart(4,'0')}</div></div>
          ${p.meetup_lat && p.meetup_lng ? `
            <div class="meta-box" onclick="openProductMap(${p.meetup_lat},${p.meetup_lng},'${(p.meetup_note||'').replace(/'/g,"\\'")}')">
              <div class="meta-l">📍 จุดนัดรับ</div>
              <div class="meta-v" style="color:var(--green);text-decoration:underline;cursor:pointer;font-size:13px">${p.meetup_note||'ดูตำแหน่งบนแผนที่'} ↗</div>
            </div>` : ''}
          </div>
        </div>
      </div>
      <div class="detail-body">
        <h3>รายละเอียดสินค้า</h3><p>${p.description||'ไม่มีรายละเอียดเพิ่มเติม'}</p>
        <h3>ผู้ขาย</h3>
        <div class="seller-card" onclick="openSellerProfile(${p.seller_id})" style="cursor:pointer">
          <div class="s-avatar" style="overflow:hidden">${p.seller_avatar?`<img src="${imgSrc(p.seller_avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`:(p.seller_name||'?').slice(0,2).toUpperCase()}</div>
          <div style="flex:1"><div class="s-name">${p.seller_name||'ไม่ระบุ'}</div><div class="s-sub">${p.location||''}</div><div class="s-rating">★ ${p.seller_rating||5.0} (${p.seller_reviews||0} รีวิว)</div></div>
          <div style="color:var(--text-hint);font-size:13px">ดูสินค้าทั้งหมด →</div>
        </div>
        <div class="reviews-section">
          <h3>รีวิว (${rv.count}) — เฉลี่ย ${rv.average}★</h3>
          ${rv.reviews.length?rv.reviews.map(r=>`<div class="review-item"><div class="review-top"><div class="review-avatar">${r.reviewer_name.slice(0,2).toUpperCase()}</div><div><div class="review-name">${r.reviewer_name}</div><div class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div></div></div><div class="review-comment">${r.comment||'—'}</div></div>`).join(''):'<p style="color:var(--text-sec);font-size:14px">ยังไม่มีรีวิว</p>'}
        </div>
      </div>
      <div class="related-wrap" id="relatedWrap"></div>`;
    goPage('detail');
    loadRelated(p.id, p.category);
  }catch(e){toast('โหลดสินค้าไม่สำเร็จ');}
}

async function loadRelated(currentId, category){
  try{
    const all=await api.getProducts({cat:category,limit:7});
    const related=all.filter(p=>p.id!==currentId).slice(0,6);
    const wrap=document.getElementById('relatedWrap');
    if(!wrap||!related.length)return;
    wrap.innerHTML=`<h3>สินค้าที่คล้ายกัน 🛍️</h3><div class="product-grid" id="relatedGrid"></div>`;
    renderCards(related,'relatedGrid');
  }catch{}
}

let _shareUrl='';
function shareProduct(id,title){
  _shareUrl=location.origin+location.pathname+'#product-'+id;
  document.getElementById('shareQrTitle').textContent=title;
  const container=document.getElementById('shareQrCode');
  container.innerHTML='';
  try{new QRCode(container,{text:_shareUrl,width:200,height:200,colorDark:'#000',colorLight:'#fff',correctLevel:QRCode.CorrectLevel.M});}
  catch(e){container.innerHTML='<div style="color:var(--text-hint);font-size:13px;padding:20px">ไม่สามารถสร้าง QR ได้</div>';}
  openOverlay('shareQrOverlay');
}
function copyShareLink(){
  navigator.clipboard.writeText(_shareUrl)
    .then(()=>toast('คัดลอกลิงก์แล้ว! 🔗','#1D9E75'))
    .catch(()=>toast('คัดลอกไม่สำเร็จ'));
}

function openReportModal(productId){
  if(!state.user){openOverlay('loginOverlay');return;}
  document.getElementById('reportProductId').value=productId;
  document.getElementById('reportDetail').value='';
  openOverlay('reportOverlay');
}
async function doReport(){
  const pid=document.getElementById('reportProductId').value;
  const reason=document.getElementById('reportReason').value;
  const detail=document.getElementById('reportDetail').value;
  try{
    const res=await api.report(pid,reason,detail);
    closeOverlay('reportOverlay');
    toast(res.message,'#1D9E75');
  }catch(e){toast(e.message);}
}

async function addToCart(id){if(!state.user){toast('กรุณาเข้าสู่ระบบก่อน');openOverlay('loginOverlay');return;}try{await api.addCart(id);state.cartCount++;updateBadge('cartBadge',state.cartCount);toast('เพิ่มลงตะกร้าแล้ว! 🛒','#1D9E75');}catch(e){toast(e.message);}}
async function toggleWl(id){if(!state.user){openOverlay('loginOverlay');return;}try{const res=await api.toggleWishlist(id);if(res.liked){state.wlIds.push(id);state.wlCount++;}else{state.wlIds=state.wlIds.filter(x=>x!==id);state.wlCount=Math.max(0,state.wlCount-1);}updateBadge('wlBadge',state.wlCount);const btn=document.getElementById('wlBtn_'+id);if(btn){btn.textContent=res.liked?'❤️':'🤍';btn.classList.toggle('liked',res.liked);}toast(res.message);}catch(e){toast(e.message);}}
async function openWishlist(){if(!state.user){openOverlay('loginOverlay');return;}try{const items=await api.getWishlist();renderCards(items.map(i=>({...i,id:i.product_id})),'wishlistGrid');goPage('wishlist');}catch(e){toast(e.message);}}
async function openCart(){
  if(!state.user){openOverlay('loginOverlay');return;}
  try{const items=await api.getCart();const c=document.getElementById('cartContent');if(!items.length){c.innerHTML='<div class="empty-msg">ตะกร้าว่างเปล่า<br><br><button class="btn btn-g" onclick="goPage(\'home\')">ดูสินค้า</button></div>';goPage('cart');return;}const total=items.reduce((s,x)=>s+x.price*x.qty,0);c.innerHTML=items.map(x=>`<div class="cart-item"><div class="cart-thumb">${x.image_url?`<img src="${imgSrc(x.image_url)}"/>`:(EMOJIS[x.category]||'📦')}</div><div class="cart-info"><div class="cart-name">${x.title}</div><div class="cart-price">฿${Number(x.price).toLocaleString()} × ${x.qty}</div></div><div class="cart-qty"><button class="btn btn-sm" onclick="changeQty(${x.product_id},${x.qty-1})">-</button><span>${x.qty}</span><button class="btn btn-sm" onclick="changeQty(${x.product_id},${x.qty+1})">+</button><button class="btn btn-sm btn-danger" onclick="removeCartItem(${x.product_id})">✕</button></div></div>`).join('')+`<div class="cart-summary"><div class="summary-row"><span>${items.length} รายการ</span><span>฿${total.toLocaleString()}</span></div><div class="summary-row"><span>ค่าจัดส่ง</span><span>ฟรี</span></div><div class="summary-total"><span>รวมทั้งหมด</span><span>฿${total.toLocaleString()}</span></div><button class="btn btn-g full" style="margin-top:16px" onclick="doCheckout()">ยืนยันชำระเงิน</button></div>`;goPage('cart');}catch(e){toast(e.message);}
}
async function changeQty(pid,qty){try{await api.updateCartQty(pid,qty);if(qty<=0)state.cartCount=Math.max(0,state.cartCount-1);updateBadge('cartBadge',state.cartCount);openCart();}catch(e){toast(e.message);}}
async function removeCartItem(pid){try{await api.removeCart(pid);state.cartCount=Math.max(0,state.cartCount-1);updateBadge('cartBadge',state.cartCount);openCart();}catch(e){toast(e.message);}}
async function doCheckout(){
  try{
    const res=await api.checkout();
    state.cartCount=0;
    updateBadge('cartBadge',0);
    window._newOrder=true;
    showPaymentQR(res.order_id, res.total, res.seller_promptpay||null, res.seller_name||'ผู้ขาย', res.seller_bank_name||null, res.seller_bank_account||null, res.seller_bank_account_name||null);
  }catch(e){toast(e.message);}
}

async function openProfile(){if(!state.user){openOverlay('loginOverlay');return;}try{const[me,myItems]=await Promise.all([api.getMe(),api.getMyProducts()]);const avatarHtml=me.avatar?`<img src="${imgSrc(me.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`:`${me.name.slice(0,2).toUpperCase()}`;document.getElementById('profileContent').innerHTML=`<div class="profile-header"><div style="display:flex;flex-direction:column;align-items:center;gap:4px"><div class="p-avatar" onclick="document.getElementById('avatarInput').click()" style="cursor:pointer;overflow:hidden">${avatarHtml}</div><div style="font-size:11px;color:var(--text-hint)">กดเพื่อเปลี่ยน</div><input type="file" id="avatarInput" accept="image/*" style="display:none" onchange="doUploadAvatar(this)"/></div><div style="flex:1"><div class="p-name">${me.name}${me.is_verified?'<span class="verified-badge" style="margin-left:6px">✅ Verified</span>':''} <span class="tier-badge tier-${me.shop_tier||'bronze'}">${{bronze:'🥉 Bronze',silver:'🥈 Silver',gold:'🥇 Gold',diamond:'💎 Diamond'}[me.shop_tier||'bronze']}</span></div><div class="p-email">${me.email}</div><div class="p-stats"><div class="stat"><div class="stat-n" style="font-size:20px">${myItems.length}</div><div class="stat-l">สินค้าลงขาย</div></div><div class="stat"><div class="stat-n" style="font-size:20px">${state.wlCount}</div><div class="stat-l">รายการโปรด</div></div><div class="stat"><div class="stat-n" style="font-size:20px">${me.rating||5.0}★</div><div class="stat-l">คะแนน</div></div></div></div></div><div class="profile-tabs"><div class="profile-tab on" id="ptab-products" onclick="profileTab('products')">สินค้าของฉัน</div><div class="profile-tab" id="ptab-orders" onclick="profileTab('orders')">ซื้อ</div><div class="profile-tab" id="ptab-my-reports" onclick="profileTab('my-reports')">🚩 แจ้งปัญหา</div><div class="profile-tab" id="ptab-selling" onclick="profileTab('selling')">📦 ขาย</div><div class="profile-tab" id="ptab-offers" onclick="profileTab('offers')">💰 ข้อเสนอ</div><div class="profile-tab" id="ptab-analytics" onclick="profileTab('analytics')">📊 สถิติ</div><button class="profile-tab" id="ptab-addresses" onclick="profileTab('addresses')">📍 ที่อยู่</button><button class="profile-tab" id="ptab-transactions" onclick="profileTab('transactions')">💰 ธุรกรรม</button><button class="profile-tab" id="ptab-promo" onclick="profileTab('promo')">🎁 โปร</button><button class="profile-tab" id="ptab-saved-searches" onclick="profileTab('saved-searches')">🔔 แจ้งเตือน</button><button class="profile-tab" id="ptab-verified-status" onclick="profileTab('verified-status')">✅ Verified</button><button class="profile-tab" id="ptab-points" onclick="profileTab('points')">⭐ แต้ม</button></div><div id="profileTabContent"></div><div style="margin-top:24px;padding:0 4px;display:flex;flex-direction:column;gap:8px"><div id="ekycSection" style="background:var(--bg-sec);border-radius:var(--radius);padding:12px;display:flex;align-items:center;justify-content:space-between"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:14px;font-weight:600">🪪 eKYC ยืนยันตัวตน</span><span id="ekycBadge" class="ekyc-badge ekyc-unverified">กำลังโหลด...</span></div><button class="btn btn-sm" onclick="openEkycVerify()">ยืนยันตัวตน</button></div><button class="btn" onclick="openShopEdit()">✏️ แก้ไขร้านค้า</button><button class="btn" onclick="openBankModal()">🏦 บัญชีธนาคาร</button><button class="btn" onclick="profileTab('verified-status');document.getElementById('ptab-verified-status').scrollIntoView({behavior:'smooth',block:'nearest'})">✅ ขอ Verified Badge</button><button class="btn" onclick="toggleHolidayMode()">${me.holiday_mode?'🏖️ ปิด Holiday Mode':'🏖️ เปิด Holiday Mode'}</button><button class="btn btn-danger" onclick="doLogout()">ออกจากระบบ</button></div>`;window._myItems=myItems;profileTab('products');goPage('profile');loadEkycStatus();}catch(e){toast(e.message);}}

function profileTab(tab){
  document.querySelectorAll('.profile-tab').forEach(t=>t.classList.toggle('on',t.id==='ptab-'+tab));
  const c=document.getElementById('profileTabContent');
  if(tab==='products'){
    c.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0 12px"><span style="font-weight:600">สินค้าของฉัน</span><div style="display:flex;gap:8px"><button class="btn btn-sm" onclick="openCSVUpload()">📊 อัปโหลด CSV</button><button class="btn btn-sm btn-g" onclick="openSell()">+ ลงขายเพิ่ม</button></div></div><div class="product-grid" id="myProductsGrid"></div><div class="promptpay-settings" id="promptpaySettings"><div style="font-weight:600;margin-bottom:8px">💳 PromptPay ของฉัน <span style="font-size:12px;color:var(--text-hint);font-weight:400">(ผู้ซื้อจะเห็นเมื่อ checkout — ไม่แสดงในโปรไฟล์)</span></div><div style="display:flex;gap:8px"><input type="text" id="promptpayInput" placeholder="เบอร์มือถือ หรือ เลขบัตรประชาชน" style="flex:1;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-sec);color:var(--text);font-size:14px"/><button class="btn btn-g btn-sm" onclick="savePromptpay()">บันทึก</button></div></div>`;
    renderMyCards(window._myItems||[],'myProductsGrid');
    api.getPromptpay().then(r=>{if(r.promptpay)document.getElementById('promptpayInput').value=r.promptpay;}).catch(()=>{});
    // Show pending reservations for seller
    api.getMyReservations().then(reservations=>{
      if(!reservations.length)return;
      const grid=document.getElementById('myProductsGrid');
      if(!grid)return;
      const html=`<div style="margin-bottom:16px;padding:12px;background:var(--bg-sec);border-radius:var(--radius-lg)"><div style="font-weight:600;margin-bottom:10px">🔖 รอยืนยันการจอง (${reservations.length})</div>${reservations.map(p=>`<div style="display:flex;align-items:center;gap:10px;padding:8px;background:var(--bg-card);border-radius:var(--radius);margin-bottom:6px"><div style="flex:1"><div style="font-size:13px;font-weight:500">${p.title}</div><div style="font-size:12px;color:var(--text-sec)">จองโดย: <b>${p.reserved_by_name||'?'}</b></div></div><button class="btn btn-sm btn-g" onclick="respondReserve(${p.id},'accept')">✅</button><button class="btn btn-sm btn-danger" onclick="respondReserve(${p.id},'reject')">❌</button></div>`).join('')}</div>`;
      grid.insertAdjacentHTML('beforebegin',html);
    }).catch(()=>{});
  } else if(tab==='selling'){
    c.innerHTML='<div class="loading">กำลังโหลด...</div>';
    api.getSellerOrders().then(orders=>{
      if(!orders.length){c.innerHTML='<div class="empty-msg">ยังไม่มีออเดอร์</div>';return;}
      const statusLabel={awaiting_payment:'⏳ รอ slip',awaiting_confirmation:'🔍 รอยืนยัน',confirmed:'✅ ยืนยันรับเงินแล้ว',completed:'🎉 เสร็จสิ้น',cancelled:'❌ ยกเลิกแล้ว',pending:'⏳ รอ slip'};
      const shipLabel={pending:'ยังไม่จัดส่ง',preparing:'📦 กำลังเตรียมของ',shipped:'🚚 ส่งพัสดุแล้ว',received:'✅ ผู้ซื้อรับแล้ว'};
      c.innerHTML='<div style="margin-top:16px">'+orders.map(o=>`
        <div class="order-item">
          <div class="order-top">
            <div>
              <div class="order-id">ออเดอร์ #${String(o.id).padStart(4,'0')}</div>
              <div class="order-date">ผู้ซื้อ: <b>${o.buyer_name}</b></div>
              <div class="order-date">${new Date(o.created_at).toLocaleDateString('th',{year:'numeric',month:'long',day:'numeric'})}</div>
            </div>
            <div class="order-total">฿${Number(o.total).toLocaleString()}</div>
          </div>
          <div class="order-items-list">${o.items}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;gap:8px;flex-wrap:wrap">
            <div style="display:flex;flex-direction:column;gap:4px">
              <div class="order-status ${['awaiting_payment','awaiting_confirmation','pending'].includes(o.status)?'status-pending':'status-done'}">${statusLabel[o.status]||o.status}</div>
              ${o.status==='confirmed'||o.status==='completed'?`<div style="font-size:12px;color:var(--text-sec)">${shipLabel[o.shipping_status]||'ยังไม่จัดส่ง'}</div>`:''}
              ${o.tracking_number?`<a class="tracking-link" href="${_trackingUrl(o.tracking_carrier,o.tracking_number)}" target="_blank" rel="noopener">📮 ${o.tracking_carrier||'Tracking'}: ${o.tracking_number} ↗</a>`:''}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
              ${o.slip_url?`<a href="${o.slip_url}" target="_blank" class="btn btn-sm">🖼️ slip</a>`:''}
              ${['awaiting_payment','awaiting_confirmation'].includes(o.status)?`<button class="btn btn-sm btn-g" onclick="doConfirmPayment(${o.id})">✅ ยืนยันรับเงิน</button>`:''}
              ${o.status==='confirmed'&&(!o.shipping_status||o.shipping_status==='pending')?`<button class="btn btn-sm" onclick="doShipOrder(${o.id},'preparing')">📦 กำลังเตรียมของ</button>`:''}
              ${o.status==='confirmed'&&o.shipping_status==='preparing'?`<button class="btn btn-sm btn-g" onclick="doShipOrder(${o.id},'shipped')">🚚 ส่งพัสดุแล้ว</button>`:''}
              ${o.status==='confirmed'&&o.shipping_status==='shipped'?`<span style="font-size:12px;color:#16a34a;font-weight:600">🚚 รอผู้ซื้อยืนยันรับ</span><button class="btn btn-sm" style="margin-left:4px" onclick="doShipOrder(${o.id},'shipped')">✏️ แก้ Tracking</button>`:''}
              ${o.status!=='completed'&&o.status!=='cancelled'?`<button class="btn btn-sm btn-danger" onclick="doSellerCancel(${o.id})">❌ ยกเลิก (คืนเงิน)</button>`:''}
              ${o.status==='completed'?`<button class="btn btn-sm" onclick="openBuyerReviewModal(${o.id})">⭐ รีวิวผู้ซื้อ</button>`:''}
            </div>
          </div>
        </div>`).join('')+'</div>';
    }).catch(e=>toast(e.message));
  } else if(tab==='orders'){
    c.innerHTML='<div class="loading">กำลังโหลด...</div>';
    api.getOrders().then(orders=>{
      if(!orders.length){c.innerHTML='<div class="empty-msg">ยังไม่มีประวัติการสั่งซื้อ</div>';return;}
      window._payOrders={};orders.forEach(o=>window._payOrders[o.id]=o);
      const statusLabel={'awaiting_payment':'⏳ รอชำระเงิน','awaiting_confirmation':'🔍 รอผู้ขายยืนยัน','confirmed':'✅ ผู้ขายยืนยันแล้ว','completed':'🎉 รับสินค้าแล้ว','cancelled':'❌ ยกเลิกแล้ว','pending':'⏳ รอดำเนินการ'};
      const shipLabel={preparing:'📦 กำลังเตรียมของ',shipped:'🚚 ส่งพัสดุแล้ว — รอรับสินค้า',received:'✅ รับสินค้าแล้ว'};
      c.innerHTML='<div style="margin-top:16px">'+orders.map(o=>`
        <div class="order-item">
          <div class="order-top">
            <div>
              <div class="order-id">คำสั่งซื้อ #${String(o.id).padStart(4,'0')}</div>
              <div class="order-date">${new Date(o.created_at).toLocaleDateString('th',{year:'numeric',month:'long',day:'numeric'})}</div>
              <div class="order-date" style="color:var(--text-sec)">ผู้ขาย: ${o.seller_name||'—'}</div>
            </div>
            <div class="order-total">฿${Number(o.total).toLocaleString()}</div>
          </div>
          <div class="order-items-list">${o.items}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;gap:8px;flex-wrap:wrap">
            <div style="display:flex;flex-direction:column;gap:4px">
              <div class="order-status ${o.status==='completed'?'status-done':o.status==='cancelled'?'status-cancel':'status-pending'}">${statusLabel[o.status]||o.status}</div>
              ${o.status==='confirmed'&&o.shipping_status&&o.shipping_status!=='pending'?`<div style="font-size:12px;color:#2563eb;font-weight:500">${shipLabel[o.shipping_status]||''}</div>`:''}
              ${o.tracking_number?`<a class="tracking-link" href="${_trackingUrl(o.tracking_carrier,o.tracking_number)}" target="_blank" rel="noopener">📮 ${o.tracking_carrier||'Tracking'}: ${o.tracking_number} ↗</a>`:''}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${['awaiting_payment','pending'].includes(o.status)?`<button class="btn btn-sm btn-g" onclick="showPaymentFromOrder(${o.id})">💳 ช่องทางชำระเงิน</button>`:''}
              ${o.seller_id&&o.status!=='cancelled'?`<button class="btn btn-sm" onclick="startChat(${o.seller_id},${o.product_id||'null'})">💬 คุยกับผู้ขาย</button>`:''}
              ${o.status==='confirmed'&&o.shipping_status==='shipped'?`<button class="btn btn-sm btn-g" onclick="markOrderReceived(${o.id})">✅ ยืนยันรับสินค้า</button>`:''}
              ${o.status==='completed'&&o.product_id?`<button class="btn btn-sm btn-g" onclick="openReviewModal(${o.product_id})">⭐ รีวิวผู้ขาย</button>`:''}
              ${o.status==='completed'?`<button class="btn-invoice" onclick="downloadInvoice(window._payOrders&&window._payOrders[${o.id}]||{id:${o.id},total_price:${o.total||0},created_at:'${o.created_at}'})">🧾 Invoice</button>`:''}
              ${(o.status==='confirmed'||o.status==='completed')?`<button class="btn btn-sm btn-danger" onclick="openDisputeModal(${o.id})">🚨 แจ้งปัญหา</button>`:''}
              ${['awaiting_payment','pending'].includes(o.status)?`<button class="btn btn-sm btn-danger" onclick="doCancelOrder(${o.id})">❌ ยกเลิก</button>`:''}
              ${o.status==='awaiting_confirmation'?`<span style="font-size:11px;color:#d97706;font-weight:500">⚠️ ส่ง slip แล้ว — ติดต่อผู้ขายหากต้องการยกเลิก</span>`:''}
            </div>
          </div>
        </div>`).join('')+'</div>';
    }).catch(e=>toast(e.message));
  } else if(tab==='offers'){
    c.innerHTML='<div class="loading">กำลังโหลด...</div>';
    Promise.all([api.getIncomingOffers(),api.getOutgoingOffers()]).then(([incoming,outgoing])=>{
      let html='<div style="margin-top:16px">';
      if(incoming.length){
        html+=`<div style="font-weight:600;margin-bottom:10px;font-size:15px">📥 ข้อเสนอที่ได้รับ (${incoming.length})</div>`;
        html+=incoming.map(o=>`
          <div class="offer-item">
            <div class="offer-top">
              <div class="offer-avatar">${(o.buyer_name||'?').slice(0,2).toUpperCase()}</div>
              <div style="flex:1">
                <div class="offer-product">${o.product_title}</div>
                <div class="offer-buyer">${o.buyer_name} เสนอ <span class="offer-price">฿${Number(o.offer_price).toLocaleString()}</span> <span style="color:var(--text-hint);font-size:12px">(ตั้งไว้ ฿${Number(o.product_price).toLocaleString()})</span></div>
                ${o.message?`<div class="offer-msg">"${o.message}"</div>`:''}
              </div>
              <div class="offer-status offer-${o.status}">${{pending:'รอตอบ',accepted:'✅ ยอมรับ',declined:'❌ ปฏิเสธ'}[o.status]}</div>
            </div>
            ${o.status==='pending'?`<div class="offer-actions"><button class="btn btn-g btn-sm" onclick="respondOffer(${o.id},'accepted')">✅ ยอมรับ</button><button class="btn btn-sm btn-danger" onclick="respondOffer(${o.id},'declined')">❌ ปฏิเสธ</button></div>`:''}
          </div>`).join('');
      }
      if(outgoing.length){
        html+=`<div style="font-weight:600;margin:20px 0 10px;font-size:15px">📤 ข้อเสนอที่ส่งไป (${outgoing.length})</div>`;
        html+=outgoing.map(o=>`
          <div class="offer-item">
            <div class="offer-top">
              <div style="flex:1">
                <div class="offer-product" style="cursor:pointer" onclick="openDetail(${o.product_id})">${o.product_title}</div>
                <div class="offer-buyer">เสนอ <span class="offer-price">฿${Number(o.offer_price).toLocaleString()}</span> หา ${o.seller_name}</div>
                ${o.message?`<div class="offer-msg">"${o.message}"</div>`:''}
              </div>
              <div class="offer-status offer-${o.status}">${{pending:'⏳ รอผล',accepted:'✅ ยอมรับ',declined:'❌ ปฏิเสธ'}[o.status]}</div>
            </div>
          </div>`).join('');
      }
      if(!incoming.length&&!outgoing.length){html+='<div class="empty-msg">ยังไม่มีข้อเสนอ</div>';}
      html+='</div>';
      c.innerHTML=html;
    }).catch(e=>toast(e.message));
  } else if(tab==='analytics'){
    c.innerHTML='<div class="loading">กำลังโหลด...</div>';
    api.getAnalytics().then(products=>{
      if(!products.length){c.innerHTML='<div class="empty-msg">ยังไม่มีสินค้า</div>';return;}
      const tv=products.reduce((s,p)=>s+(p.view_count||0),0);
      const tw=products.reduce((s,p)=>s+(p.wishlist_count||0),0);
      const to=products.reduce((s,p)=>s+(p.offer_count||0),0);
      c.innerHTML=`<div class="analytics-summary"><div class="analytics-card"><div class="analytics-n">${tv}</div><div class="analytics-l">👁️ ยอดชมรวม</div></div><div class="analytics-card"><div class="analytics-n">${tw}</div><div class="analytics-l">❤️ ถูกใจรวม</div></div><div class="analytics-card"><div class="analytics-n">${to}</div><div class="analytics-l">💰 ข้อเสนอรวม</div></div></div><div style="overflow-x:auto;margin-top:16px"><table class="data-table"><thead><tr><th>สินค้า</th><th>ราคา</th><th>👁️</th><th>❤️</th><th>💰</th><th>สถานะ</th></tr></thead><tbody>${products.map(p=>`<tr style="cursor:pointer" onclick="openDetail(${p.id})"><td><div style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px">${p.title}</div></td><td style="font-size:13px">฿${Number(p.price).toLocaleString()}</td><td style="text-align:center">${p.view_count||0}</td><td style="text-align:center">${p.wishlist_count||0}</td><td style="text-align:center">${p.offer_count||0}</td><td><span style="font-size:11px;padding:2px 7px;border-radius:99px;background:${p.status==='available'?'#f0fdf4':'#f9fafb'};color:${p.status==='available'?'#16a34a':'#6b7280'}">${p.status==='available'?'วางขาย':'ขายแล้ว'}</span></td></tr>`).join('')}</tbody></table></div>`;
    }).catch(e=>toast(e.message));
  } else if(tab==='addresses'){
    openAddressesTab();
  } else if(tab==='transactions'){
    openTransactionsTab();
  } else if(tab==='promo'){
    openPromoTab();
  } else if(tab==='saved-searches'){
    openSavedSearchesTab();
  } else if(tab==='verified-status'){
    openVerifiedStatusTab();
  } else if(tab==='my-reports'){
    const c=document.getElementById('profileTabContent');
    c.innerHTML='<div class="loading">กำลังโหลด...</div>';
    const rColor={pending:'#d97706',reviewed:'#2563eb',resolved:'#16a34a'};
    const rLabel={pending:'⏳ รอ admin ตรวจสอบ',reviewed:'🔵 admin รับเรื่องแล้ว',resolved:'✅ แก้ไขแล้ว'};
    api.getMyReports().then(reports=>{
      if(!reports.length){c.innerHTML='<div class="empty-state"><span class="empty-state-icon">🚩</span><h3>ยังไม่มีการแจ้งปัญหา</h3><p>หากพบสินค้าที่ไม่เหมาะสม กดปุ่ม 🚩 แจ้ง ที่การ์ดสินค้า</p></div>';return;}
      c.innerHTML='<div style="margin-top:16px">'+reports.map(r=>`
        <div class="order-item">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
            <div style="font-weight:600;font-size:14px">${r.product_title}</div>
            <span style="font-size:12px;font-weight:600;color:${rColor[r.status]||'#666'};white-space:nowrap">${rLabel[r.status]||r.status}</span>
          </div>
          <div style="font-size:13px;color:var(--text-sec);margin-bottom:4px"><b>เหตุผล:</b> ${r.reason}</div>
          ${r.detail?`<div style="font-size:12px;color:var(--text-hint);margin-bottom:4px">${r.detail}</div>`:''}
          <div style="font-size:11px;color:var(--text-hint)">${new Date(r.created_at).toLocaleDateString('th',{year:'numeric',month:'long',day:'numeric'})}</div>
        </div>`).join('')+'</div>';
    }).catch(e=>toast(e.message));
  } else if(tab==='points'){
    openPointsTab();
  }
}

async function openPointsTab(){
  const c=document.getElementById('profileTabContent');
  c.innerHTML='<div class="loading">กำลังโหลด...</div>';
  try{
    const data=await api.getPoints();
    const u=state.user;
    const tierColor={bronze:'#cd7f32',silver:'#9ca3af',gold:'#f59e0b',diamond:'#3b82f6'};
    const tierLabel={bronze:'🥉 Bronze',silver:'🥈 Silver',gold:'🥇 Gold',diamond:'💎 Diamond'};
    const tier=u.shop_tier||'bronze';
    const reasonIcons={'ซื้อสินค้าสำเร็จ':'🛍️','แนะนำเพื่อน':'🎁','โบนัสผู้แนะนำ':'🎉','สมัครสมาชิกใหม่':'🎊'};
    const refLink=`${location.origin}${location.pathname}?ref=${u.referral_code}`;
    c.innerHTML=`
      <div style="padding:16px 0">
        <div class="points-card">
          <div style="font-size:13px;opacity:.8;margin-bottom:4px">แต้มสะสม</div>
          <div style="font-size:48px;font-weight:800;line-height:1">${(data.balance||0).toLocaleString()}</div>
          <div style="font-size:13px;opacity:.8;margin-top:4px">คะแนน</div>
          <div style="margin-top:12px;padding:6px 14px;background:rgba(255,255,255,.2);border-radius:20px;display:inline-block;font-size:13px;font-weight:700">
            ${tierLabel[tier]||tier}
          </div>
        </div>
        <div style="background:var(--card);border-radius:12px;padding:16px;margin-top:16px">
          <div style="font-weight:600;margin-bottom:10px">🎁 ลิงก์แนะนำเพื่อน</div>
          <div style="font-size:12px;color:var(--text-sec);margin-bottom:8px">แชร์ลิงก์นี้ — เพื่อนสมัครได้ทั้งคู่แต้ม!</div>
          <div style="display:flex;gap:8px;align-items:center">
            <input readonly value="${refLink}" style="flex:1;border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:12px;background:var(--bg);color:var(--text)" onclick="this.select()"/>
            <button class="btn btn-g btn-sm" onclick="navigator.clipboard.writeText('${refLink}').then(()=>toast('คัดลอกแล้ว ✅','#1D9E75'))">📋 คัดลอก</button>
          </div>
          <div style="margin-top:8px;font-size:12px;color:var(--text-hint)">รหัสของคุณ: <b style="color:var(--green);font-size:14px">${u.referral_code||'-'}</b></div>
        </div>
        <div style="margin-top:16px">
          <div style="font-weight:600;margin-bottom:10px">📋 ประวัติแต้ม</div>
          ${data.log&&data.log.length?data.log.map(l=>`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
              <div>
                <div style="font-size:14px">${reasonIcons[l.reason]||'⭐'} ${l.reason}</div>
                <div style="font-size:11px;color:var(--text-hint)">${new Date(l.created_at).toLocaleDateString('th',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
              </div>
              <div style="font-weight:700;color:${l.points>0?'#16a34a':'#dc2626'};font-size:16px">${l.points>0?'+':''}${l.points}</div>
            </div>`).join(''):'<div style="color:var(--text-sec);font-size:14px;padding:12px 0">ยังไม่มีประวัติแต้ม</div>'}
        </div>
      </div>`;
  }catch(e){toast(e.message);}
}

async function doUploadAvatar(input){if(!input.files[0])return;const fd=new FormData();fd.append('avatar',input.files[0]);try{const res=await api.uploadAvatar(fd);toast('อัปเดตรูปโปรไฟล์แล้ว ✅','#1D9E75');openProfile();}catch(e){toast(e.message);}}

async function toggleFollow(sellerId){if(!state.user){openOverlay('loginOverlay');return;}try{const res=await api.toggleFollow(sellerId);toast(res.message,res.following?'#1D9E75':undefined);openSellerProfile(sellerId);}catch(e){toast(e.message);}}
async function openSellerProfile(userId){try{const reqs=[api.getSeller(userId),api.getSellerProducts(userId),api.getFollowerCount(userId),api.getSellerReviews(userId)];if(state.user)reqs.push(api.getFollowStatus(userId));const[seller,products,followerData,reviewData,...rest]=await Promise.all(reqs);const followStatus=rest[0];document.getElementById('sellerBackBtn').onclick=()=>history.back();const avatarHtml=seller.avatar?`<img src="${imgSrc(seller.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`:`${(seller.name||'?').slice(0,2).toUpperCase()}`;const isOwnProfile=state.user&&state.user.id===seller.id;const isFollowing=followStatus?.following||false;const followerCount=followerData?.count||0;
const reviewsHtml=reviewData.reviews.length?reviewData.reviews.map(r=>`<div class="review-item"><div class="review-top"><div class="review-avatar">${r.reviewer_name.slice(0,2).toUpperCase()}</div><div style="flex:1"><div class="review-name">${r.reviewer_name}</div><div class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>${r.product_title?`<div style="font-size:11px;color:var(--text-hint);margin-top:2px">สินค้า: ${r.product_title}</div>`:''}</div><div style="font-size:11px;color:var(--text-hint)">${new Date(r.created_at).toLocaleDateString('th',{year:'numeric',month:'short',day:'numeric'})}</div></div><div class="review-comment">${r.comment||'—'}</div></div>`).join(''):`<p style="color:var(--text-sec);font-size:14px;padding:8px 0">ยังไม่มีรีวิว</p>`;
const tierLabel={bronze:'🥉 Bronze',silver:'🥈 Silver',gold:'🥇 Gold',diamond:'💎 Diamond'};const tierClass={bronze:'tier-bronze',silver:'tier-silver',gold:'tier-gold',diamond:'tier-diamond'};const sellerTier=seller.shop_tier||'bronze';const publicProducts=products.filter(p=>!p.is_draft);
document.getElementById('sellerContent').innerHTML=`<div class="profile-header"><div class="p-avatar" style="overflow:hidden">${avatarHtml}</div><div style="flex:1"><div class="p-name">${seller.name}${seller.is_verified?'<span class="verified-badge">✅ ยืนยันแล้ว</span>':''} <span class="tier-badge ${tierClass[sellerTier]}">${tierLabel[sellerTier]}</span></div><div class="p-email">สมาชิกตั้งแต่ ${new Date(seller.created_at).toLocaleDateString('th',{year:'numeric',month:'long'})}</div><div class="p-stats"><div class="stat"><div class="stat-n" style="font-size:20px">${products.length}</div><div class="stat-l">สินค้า</div></div><div class="stat"><div class="stat-n" style="font-size:20px">${seller.rating||5.0}★</div><div class="stat-l">คะแนน</div></div><div class="stat"><div class="stat-n" style="font-size:20px">${reviewData.count||0}</div><div class="stat-l">รีวิว</div></div><div class="stat"><div class="stat-n" style="font-size:20px">${followerCount}</div><div class="stat-l">ผู้ติดตาม</div></div></div>${!isOwnProfile?`<div style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-g" style="flex:1" onclick="startChat(${seller.id},null)">💬 แชทกับผู้ขาย</button><button class="btn ${isFollowing?'btn-danger':''}" style="flex:1" onclick="toggleFollow(${seller.id})">${isFollowing?'💔 เลิกติดตาม':'❤️ ติดตาม'}</button></div>`:''}</div></div>${renderSellerStories(seller.id)}<div class="section-title" style="margin-top:20px"><span>สินค้าทั้งหมด (${publicProducts.length})</span></div><div class="product-grid" id="sellerProductGrid"></div><div class="reviews-section" style="margin-top:24px"><h3>รีวิวผู้ขาย (${reviewData.count}) — เฉลี่ย ${reviewData.average}★</h3>${reviewsHtml}</div>`;renderCards(publicProducts,'sellerProductGrid');goPage('seller');}catch(e){toast(e.message);}}

function canBump(bumpedAt){
  if(!bumpedAt)return true;
  const last=new Date(bumpedAt);
  const now=new Date();
  return last.toDateString()!==now.toDateString();
}
function renderMyCards(list,cid){const g=document.getElementById(cid);if(!g)return;if(!list.length){g.innerHTML='<div class="empty-msg">ยังไม่มีสินค้า<br><br><button class="btn btn-g" onclick="openSell()">+ ลงขายเลย</button></div>';return;}g.innerHTML=list.map(p=>{const isDraft=p.is_draft==1;const bumpable=!isDraft&&p.status==='available'&&canBump(p.bumped_at);const bumpBtn=!isDraft&&p.status==='available'?`<button class="btn btn-sm btn-bump" onclick="doBump(${p.id})" ${bumpable?'':'disabled title="ดันได้พรุ่งนี้"'}>⬆️ ${bumpable?'ดัน':'ดันแล้ว'}</button>`:'';const flashBtn=!isDraft&&p.status==='available'?`<button class="btn btn-sm" style="background:#fef9c3;color:#854d0e;border-color:#fcd34d" onclick="openFlashModal(${p.id},${p.price})">⚡</button>`:'';const draftBadge=isDraft?`<span class="draft-badge">DRAFT</span>`:'';const publishBtn=isDraft?`<button class="btn btn-sm publish-btn" onclick="publishDraft(${p.id})">📤 เผยแพร่</button>`:'';const statusLabel=isDraft?'<span style="color:#6b7280;font-size:12px">📝 Draft</span>':p.status==='sold'?'<span style="color:#dc2626">ขายแล้ว</span>':p.status==='reserved'?'<span style="color:#d97706">กำลังถูกจอง</span>':'<span style="color:var(--green)">วางขาย</span>';return `<div class="card"><div class="card-img" onclick="openDetail(${p.id})">${productImg(p)}${draftBadge}</div><div class="card-body" onclick="openDetail(${p.id})"><div class="card-title">${p.title}</div><div class="card-price">฿${Number(p.price).toLocaleString()}</div><div class="card-foot"><span class="cond ${CMAP[p.condition||p.cond]||''}">${p.condition||p.cond}</span>${statusLabel}</div></div><div class="card-actions">${publishBtn}${bumpBtn}${flashBtn}<button class="btn btn-sm" onclick="openEditModal(${p.id})">✏️ แก้ไข</button><button class="btn btn-sm btn-danger" onclick="confirmDeleteProduct(${p.id})">🗑️ ลบ</button></div></div>`;}).join('');}

async function doBump(id){
  try{
    const res=await api.bumpProduct(id);
    toast(res.message,'#1D9E75');
    loadProducts();
    // refresh my products list
    const myItems=await api.getMyProducts();
    window._myItems=myItems;
    const grid=document.getElementById('myProductsGrid');
    if(grid)renderMyCards(myItems,'myProductsGrid');
  }catch(e){toast(e.message);}
}

async function publishDraft(id){
  if(!confirm('เผยแพร่สินค้านี้?'))return;
  try{
    await api.updateProduct(id,{is_draft:0,publish_at:null});
    toast('เผยแพร่สินค้าแล้ว ✅','#1D9E75');
    loadProducts();
    const myItems=await api.getMyProducts();
    window._myItems=myItems;
    const grid=document.getElementById('myProductsGrid');
    if(grid)renderMyCards(myItems,'myProductsGrid');
  }catch(e){toast(e.message);}
}

function downloadInvoice(order){
  try{
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF();
    doc.setFont('helvetica');
    doc.setFontSize(18);doc.setTextColor(29,158,117);
    doc.text('INVOICE',105,20,{align:'center'});
    doc.setFontSize(10);doc.setTextColor(100);
    doc.text('PloiKhong',105,28,{align:'center'});
    doc.setDrawColor(29,158,117);doc.setLineWidth(0.5);
    doc.line(14,33,196,33);
    doc.setFontSize(11);doc.setTextColor(30);
    doc.text(`Order #${order.id}`,14,42);
    doc.text(`วันที่: ${new Date(order.created_at||Date.now()).toLocaleDateString('th',{year:'numeric',month:'long',day:'numeric'})}`,14,50);
    doc.text(`สถานะ: ${order.status||'completed'}`,14,58);
    doc.setDrawColor(220);doc.line(14,64,196,64);
    doc.setFontSize(10);doc.setTextColor(80);
    doc.text('รายการสินค้า',14,72);
    doc.setFontSize(11);doc.setTextColor(30);
    let y=80;
    const items=order.items||[{title:order.product_title||'สินค้า',qty:order.qty||1,price:order.total_price||0}];
    items.forEach((item,i)=>{
      doc.text(`${i+1}. ${item.title||item.product_title}`,14,y);
      doc.text(`x${item.qty||1}`,140,y);
      doc.text(`฿${Number(item.price||item.total_price||0).toLocaleString()}`,180,y,{align:'right'});
      y+=9;
    });
    doc.setDrawColor(29,158,117);doc.line(14,y+2,196,y+2);
    doc.setFontSize(13);doc.setTextColor(29,158,117);
    doc.text(`รวมทั้งสิ้น: ฿${Number(order.total_price||0).toLocaleString()}`,196,y+12,{align:'right'});
    doc.setFontSize(9);doc.setTextColor(150);
    doc.text('ขอบคุณที่ใช้บริการ PloiKhong',105,285,{align:'center'});
    doc.save(`invoice-order-${order.id}.pdf`);
  }catch(e){toast('ไม่สามารถสร้าง PDF ได้: '+e.message);}
}

async function openEditModal(id){
  _clearAccFiles('eImgNew');
  _meetupData.e = null;
  const ewm = document.getElementById('eWatermark'); if (ewm) ewm.checked = false;
  try{
    const p = await api.getProduct(id);
    document.getElementById('eId').value = p.id;
    document.getElementById('eTitle').value = p.title;
    document.getElementById('ePrice').value = p.price;
    document.getElementById('eDesc').value = p.description||'';
    document.getElementById('eLoc').value = p.location||'';
    document.getElementById('eCat').value = p.category;
    document.getElementById('eCond').value = p.condition;
    document.getElementById('eStatus').value = p.status||'available';
    document.getElementById('eDel').value = p.delivery_method||'both';
    document.getElementById('eImgNew').value = '';
    document.getElementById('eImgNewPreview').innerHTML = '';

    // load meetup เดิม (ถ้ามี)
    if (p.meetup_lat && p.meetup_lng) {
      _meetupData.e = { lat: p.meetup_lat, lng: p.meetup_lng, note: p.meetup_note||'' };
      const info = document.getElementById('eMeetupInfo');
      if (info) { info.style.display='block'; info.textContent=`📍 ${Number(p.meetup_lat).toFixed(5)}, ${Number(p.meetup_lng).toFixed(5)}${p.meetup_note?' · '+p.meetup_note:''}`; }
    } else {
      const info = document.getElementById('eMeetupInfo');
      if (info) { info.style.display='none'; info.textContent=''; }
    }
    toggleMeetupBtn('e');

    // แสดงรูปปัจจุบัน พร้อม drag & drop
    const grid = document.getElementById('eImgGrid');
    const imgs = p.images && p.images.length ? p.images : (p.image_url ? [{id:null,url:p.image_url}] : []);
    window._editProductId = p.id;
    renderEditImgGrid(imgs, p.id);

    openOverlay('editOverlay');
  }catch(e){toast(e.message);}
}

async function deleteProductImage(productId, imageId){
  if(!confirm('ลบรูปนี้?'))return;
  try{
    await api.deleteProductImage(productId, imageId);
    toast('ลบรูปแล้ว');
    // อัปเดต array แล้ว re-render
    _editImgs = _editImgs.filter(img => img.id !== imageId);
    renderEditImgGrid(_editImgs, productId);
  }catch(e){toast(e.message);}
}

// previewEditImages (ใช้เวอร์ชันสมบูรณ์บรรทัดล่าง — ลบ duplicate นี้ออก)
function _previewEditImages_UNUSED(input){
  const preview = document.getElementById('eImgNewPreview');
  preview.innerHTML = '';
  Array.from(input.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const div = document.createElement('div');
      div.style.cssText = 'position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:1px solid var(--border)';
      div.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover"/>`;
      preview.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
}

async function doEditProduct(){
  const id=document.getElementById('eId').value;
  const title=document.getElementById('eTitle').value.trim();
  const price=document.getElementById('ePrice').value;
  if(!title||!price){toast('กรุณากรอกชื่อสินค้าและราคา');return;}
  try{
    const newFiles = document.getElementById('eImgNew').files;
    if(newFiles && newFiles.length > 0){
      // มีรูปใหม่ → ส่งเป็น FormData
      const fd = new FormData();
      fd.append('title',title); fd.append('price',price);
      fd.append('category',document.getElementById('eCat').value);
      fd.append('condition',document.getElementById('eCond').value);
      fd.append('description',document.getElementById('eDesc').value);
      fd.append('location',document.getElementById('eLoc').value);
      fd.append('status',document.getElementById('eStatus').value);
      fd.append('delivery_method',document.getElementById('eDel').value);
      const wm = document.getElementById('eWatermark')?.checked ? '1' : '0';
      fd.append('watermark', wm);
      fd.append('meetup_lat', _meetupData.e ? _meetupData.e.lat : '');
      fd.append('meetup_lng', _meetupData.e ? _meetupData.e.lng : '');
      fd.append('meetup_note', _meetupData.e ? (_meetupData.e.note||'') : '');
      Array.from(newFiles).forEach(f => fd.append('images',f));
      await api.req('PUT','/api/products/'+id,fd,true);
    } else {
      const upd = {title,price:Number(price),
        category:document.getElementById('eCat').value,
        condition:document.getElementById('eCond').value,
        description:document.getElementById('eDesc').value,
        location:document.getElementById('eLoc').value,
        status:document.getElementById('eStatus').value,
        delivery_method:document.getElementById('eDel').value,
        meetup_lat: _meetupData.e ? _meetupData.e.lat : null,
        meetup_lng: _meetupData.e ? _meetupData.e.lng : null,
        meetup_note: _meetupData.e ? (_meetupData.e.note||'') : ''};
      await api.updateProduct(id,upd);
    }
    closeOverlay('editOverlay');
    toast('อัปเดตสินค้าแล้ว ✅','#1D9E75');
    loadProducts();
    openProfile();
  }catch(e){toast(e.message);}
}

async function confirmDeleteProduct(id){if(!confirm('ลบสินค้านี้? จะไม่สามารถกู้คืนได้'))return;try{await api.deleteProduct(id);toast('ลบสินค้าแล้ว');openProfile();}catch(e){toast(e.message);}}

function openOfferModal(productId, title, price){
  if(!state.user){openOverlay('loginOverlay');return;}
  document.getElementById('offerProductId').value=productId;
  document.getElementById('offerPrice').value='';
  document.getElementById('offerMessage').value='';
  document.getElementById('offerProductInfo').innerHTML=`<div style="font-weight:600;margin-bottom:4px">${title}</div><div style="color:var(--green)">ราคาตั้ง ฿${Number(price).toLocaleString()}</div>`;
  openOverlay('offerOverlay');
}
async function doMakeOffer(){
  const pid=document.getElementById('offerProductId').value;
  const price=document.getElementById('offerPrice').value;
  const msg=document.getElementById('offerMessage').value;
  if(!price||Number(price)<=0){toast('กรุณาใส่ราคาที่เสนอ');return;}
  try{
    const res=await api.makeOffer(pid,Number(price),msg);
    closeOverlay('offerOverlay');
    toast(res.message,'#1D9E75');
  }catch(e){toast(e.message);}
}
async function respondOffer(id,status){
  try{
    const res=await api.respondOffer(id,status);
    toast(res.message,status==='accepted'?'#1D9E75':undefined);
    profileTab('offers');
  }catch(e){toast(e.message);}
}

function switchTab(t){document.getElementById('loginForm').classList.toggle('hidden',t!=='login');document.getElementById('regForm').classList.toggle('hidden',t!=='reg');document.getElementById('tabLogin').classList.toggle('on',t==='login');document.getElementById('tabReg').classList.toggle('on',t==='reg');}
async function doLogin(){const email=document.getElementById('loginEmail').value.trim(),pass=document.getElementById('loginPass').value;if(!email||!pass){toast('กรุณากรอกข้อมูลให้ครบ');return;}try{const res=await api.login(email,pass);localStorage.setItem('token',res.token);localStorage.setItem('user',JSON.stringify(res.user));state.user=res.user;state.token=res.token;closeOverlay('loginOverlay');updateNav();toast('ยินดีต้อนรับ '+res.user.name+'!','#1D9E75');await syncBadges();connectSocket();}catch(e){toast(e.message);}}
async function doRegister(){const name=document.getElementById('regName').value.trim(),email=document.getElementById('regEmail').value.trim(),pass=document.getElementById('regPass').value;if(!name||!email||!pass){toast('กรุณากรอกข้อมูลให้ครบ');return;}try{const res=await api.register(name,email,pass);localStorage.setItem('token',res.token);localStorage.setItem('user',JSON.stringify(res.user));state.user=res.user;state.token=res.token;closeOverlay('loginOverlay');updateNav();toast('สมัครสำเร็จ! ยินดีต้อนรับ 🎉','#1D9E75');connectSocket();}catch(e){toast(e.message);}}
function doLogout(){if(socket){socket.disconnect();socket=null;}localStorage.removeItem('token');localStorage.removeItem('user');state.user=null;state.token=null;state.cartCount=0;state.wlCount=0;state.notifCount=0;state.chatCount=0;state.wlIds=[];['cartBadge','wlBadge','notifBadge','chatBadge'].forEach(id=>updateBadge(id,0));updateNav();goPage('home');toast('ออกจากระบบแล้ว');}
function openSell(){if(!state.user){toast('กรุณาเข้าสู่ระบบก่อน');openOverlay('loginOverlay');return;}_clearAccFiles('sImg');_meetupData.s=null;const si=document.getElementById('sMeetupInfo');if(si){si.style.display='none';si.textContent='';}const sDel=document.getElementById('sDel');if(sDel)sDel.value='both';const sr=document.getElementById('sMeetupRow');if(sr)sr.style.display='block';openOverlay('sellOverlay');}
async function doSell(){const title=document.getElementById('sTitle').value.trim(),price=document.getElementById('sPrice').value;if(!title||!price){toast('กรุณากรอกชื่อสินค้าและราคา');return;}const delMethod=document.getElementById('sDel').value;if(delMethod==='pickup'&&!_meetupData.s){toast('กรุณาเลือกจุดนัดรับบนแผนที่ก่อน 📍');return;}const fd=new FormData();fd.append('title',title);fd.append('price',price);fd.append('category',document.getElementById('sCat').value);fd.append('condition',document.getElementById('sCond').value);fd.append('description',document.getElementById('sDesc').value);fd.append('location',document.getElementById('sLoc').value);fd.append('delivery_method',document.getElementById('sDel').value);const isDraft=document.getElementById('sellDraft')?.checked;const publishAt=document.getElementById('sellPublishAt')?.value;if(isDraft)fd.append('is_draft','1');if(publishAt)fd.append('publish_at',publishAt);const watermark=document.getElementById('sellWatermark')?.checked?'1':'0';fd.append('watermark',watermark);if(_meetupData.s){fd.append('meetup_lat',_meetupData.s.lat);fd.append('meetup_lng',_meetupData.s.lng);fd.append('meetup_note',_meetupData.s.note||'');}const imgs=document.getElementById('sImg').files;for(const img of imgs)fd.append('images',img);try{
    await api.createProduct(fd);
    closeOverlay('sellOverlay');
    ['sTitle','sPrice','sDesc','sLoc'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('sImg').value='';
    document.getElementById('imgPreviewGrid').innerHTML='';
    toast('ลงขายสินค้าสำเร็จ! 🎉','#1D9E75');
    loadProducts();
    // refresh profile product list ทันที
    const myItems=await api.getMyProducts();
    window._myItems=myItems;
    const grid=document.getElementById('myProductsGrid');
    if(grid)renderMyCards(myItems,'myProductsGrid');
    const ptab=document.getElementById('ptab-products');
    if(ptab)ptab.textContent=`สินค้าของฉัน (${myItems.length})`;
  }catch(e){toast(e.message);}}

function openReviewModal(pid){if(!state.user){openOverlay('loginOverlay');return;}document.getElementById('reviewProductId').value=pid;document.getElementById('reviewComment').value='';state.starRating=0;setStar(0);openOverlay('reviewOverlay');}
function setStar(n){state.starRating=n;document.querySelectorAll('#starPicker .star').forEach((s,i)=>s.classList.toggle('on',i<n));}
async function doReview(){const pid=document.getElementById('reviewProductId').value,comment=document.getElementById('reviewComment').value;if(!state.starRating){toast('กรุณาให้คะแนนก่อน');return;}try{await api.submitReview(pid,state.starRating,comment);closeOverlay('reviewOverlay');toast('ส่งรีวิวแล้ว! ⭐','#1D9E75');openDetail(pid);}catch(e){toast(e.message);}}

async function askAvailable(sellerId,productId,title){
  if(!state.user){openOverlay('loginOverlay');return;}
  try{
    const room=await api.openChatRoom(sellerId,productId);
    await openChatList();
    openRoom(room.id);
    // ส่งข้อความอัตโนมัติหลัง room โหลดเสร็จ
    setTimeout(()=>{
      const input=document.getElementById('msgInput');
      if(input&&socket){
        socket.emit('send_message',{room_id:room.id,content:`สวัสดีครับ/ค่ะ สินค้า "${title}" ยังมีอยู่ไหมครับ/ค่ะ? 🙋`});
      }
    },600);
  }catch(e){toast(e.message);}
}

async function startChat(sellerId,productId){if(!state.user){openOverlay('loginOverlay');return;}try{const room=await api.openChatRoom(sellerId,productId);await openChatList();openRoom(room.id);}catch(e){toast(e.message);}}
async function openChatList(){if(!state.user){openOverlay('loginOverlay');return;}try{const rooms=await api.getChatRooms();window._chatRooms=rooms;const list=document.getElementById('chatRoomsList');if(!rooms.length){list.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-sec);font-size:13px">ยังไม่มีการสนทนา</div>';goPage('chat');return;}list.innerHTML=rooms.map(r=>{const other=r.buyer_id===state.user.id?r.seller_name:r.buyer_name;return `<div class="chat-room-item ${r.unread>0?'unread':''}" onclick="openRoom(${r.id})"><div style="display:flex;justify-content:space-between"><div class="cr-name">${other}</div><div class="cr-time">${r.last_at?new Date(r.last_at).toLocaleTimeString('th',{hour:'2-digit',minute:'2-digit'}):''}</div></div><div class="cr-last">${r.product_title?'['+r.product_title+'] ':''} ${r.last_message||'เริ่มการสนทนา'}</div></div>`;}).join('');goPage('chat');}catch(e){toast(e.message);}}
async function openRoom(roomId){
  currentRoomId=roomId;
  try{
    const msgs=await api.getMessages(roomId);
    const room=(window._chatRooms||[]).find(r=>r.id===roomId);
    const isSeller=room&&state.user&&room.seller_id===state.user.id;
    const otherName=room?(room.buyer_id===state.user.id?room.seller_name:room.buyer_name):'';
    const headerInfo=room?.product_title
      ?`<div style="flex:1"><div style="font-weight:600;font-size:14px">${otherName}</div><div style="font-size:12px;color:var(--text-sec);margin-top:1px">📦 ${room.product_title}</div></div>`
      :`<div style="flex:1;font-weight:600">${otherName||'การสนทนา'}</div>`;
    const closeSaleBtn=(isSeller&&room?.product_id)
      ?`<button class="btn btn-sm btn-danger" onclick="doCloseSale(${room.product_id})" id="closeSaleBtn">🏷️ ปิดการขาย</button>`
      :'';
    document.getElementById('chatMain').innerHTML=`
      <div class="chat-header" style="display:flex;align-items:center;gap:8px">${headerInfo}${closeSaleBtn}</div>
      <div class="chat-messages" id="msgList">${msgs.map(m=>renderMsg(m,state.user.id)).join('')}</div>
      <div class="quick-replies">${QUICK_REPLIES.map(t=>`<button class="qr-btn" onclick="fillQuickReply('${t}')">${t}</button>`).join('')}</div>
      <div id="voiceRecordingBar" style="display:none;padding:6px 12px;background:var(--green-light);color:var(--green-dark);font-size:13px;font-weight:600;border-radius:var(--radius);margin:4px 8px;text-align:center">🎙️ <span id="voiceRecordingTxt">กำลังอัดเสียง...</span> <span class="recording-pulse">●</span></div>
      <div class="chat-input"><input type="text" id="msgInput" placeholder="พิมพ์ข้อความ..." onkeydown="if(event.key==='Enter')sendMsg()" autocomplete="off"/><button class="btn btn-sm" onclick="document.getElementById('chatImgInput').click()" title="ส่งรูป">📷</button><input type="file" id="chatImgInput" accept="image/*" style="display:none" onchange="sendChatImage(this)"/><button id="chatMicBtn" class="btn btn-sm" onclick="toggleVoiceRecord()" title="อัดข้อความเสียง">🎙️</button><button onclick="sendMsg()">ส่ง</button></div>`;
    const ml=document.getElementById('msgList');
    if(ml)ml.scrollTop=ml.scrollHeight;
    if(socket)socket.emit('join_room',roomId);
    state.chatCount=Math.max(0,state.chatCount-1);
    updateBadge('chatBadge',state.chatCount);
  }catch(e){toast(e.message);}
}
async function doCloseSale(productId){
  if(!confirm('ปิดการขายสินค้านี้? สินค้าจะถูกทำเครื่องหมายว่า "ขายแล้ว"'))return;
  try{
    const res=await api.closeSale(productId);
    toast(res.message,'#1D9E75');
    // ซ่อนปุ่มหลังปิดแล้ว
    const btn=document.getElementById('closeSaleBtn');
    if(btn)btn.remove();
    // ส่งข้อความในแชทแจ้งผู้ซื้อ
    if(socket&&currentRoomId){
      socket.emit('send_message',{room_id:currentRoomId,content:'🏷️ ปิดการขายสินค้านี้แล้ว ขอบคุณที่ซื้อขายด้วยกันนะครับ/ค่ะ'});
    }
    loadProducts();
  }catch(e){toast(e.message);}
}
function sendMsg(){const input=document.getElementById('msgInput');if(!input||!input.value.trim()||!socket)return;socket.emit('send_message',{room_id:currentRoomId,content:input.value.trim()});input.value='';}
function renderMsg(m, myId){const out=m.sender_id===myId;const isImg=m.content&&m.content.startsWith('__img__:');const isVoice=m.content&&m.content.startsWith('__voice__:');let msgBody;if(isImg){msgBody=`<img src="${m.content.slice(8)}" style="max-width:200px;border-radius:8px;cursor:pointer;display:block" onclick="window.open(this.src)" loading="lazy"/>`;}else if(isVoice){msgBody=`<div class="voice-msg"><audio controls src="${m.content.slice(10)}" preload="none"></audio></div>`;}else{msgBody=m.content;}return `<div>${!out?`<div class="msg-name">${m.sender_name}</div>`:''}<div class="msg ${out?'msg-out':'msg-in'}">${msgBody}<div class="msg-time">${new Date(m.created_at).toLocaleTimeString('th',{hour:'2-digit',minute:'2-digit'})}</div></div></div>`;}
async function sendChatImage(input){if(!input.files[0]||!currentRoomId)return;const fd=new FormData();fd.append('image',input.files[0]);try{toast('กำลังส่งรูป...');await api.sendChatImage(currentRoomId,fd);const msgs=await api.getMessages(currentRoomId);const ml=document.getElementById('msgList');if(!ml)return;ml.innerHTML=msgs.map(m=>renderMsg(m,state.user.id)).join('');ml.scrollTop=ml.scrollHeight;input.value='';}catch(e){toast(e.message);}}

// ===== VOICE RECORDING =====
let _mediaRecorder=null,_audioChunks=[],_isRecording=false;
async function toggleVoiceRecord(){if(_isRecording){stopVoiceRecord();}else{await startVoiceRecord(currentRoomId);}}
async function startVoiceRecord(roomId){if(!roomId){toast('กรุณาเลือกห้องแชทก่อน');return;}try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});_audioChunks=[];_isRecording=true;const micBtn=document.getElementById('chatMicBtn');const bar=document.getElementById('voiceRecordingBar');if(micBtn){micBtn.textContent='⏹️';micBtn.style.background='var(--green)';micBtn.style.color='#fff';}if(bar)bar.style.display='block';const mimeType=MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':'audio/ogg';_mediaRecorder=new MediaRecorder(stream,{mimeType});_mediaRecorder.ondataavailable=e=>{if(e.data.size>0)_audioChunks.push(e.data);};_mediaRecorder.onstop=async()=>{const blob=new Blob(_audioChunks,{type:_mediaRecorder.mimeType||'audio/webm'});stream.getTracks().forEach(t=>t.stop());await sendVoiceMessage(roomId,blob);_audioChunks=[];};_mediaRecorder.start();}catch(e){_isRecording=false;toast('ไม่สามารถเข้าถึงไมค์ได้: '+e.message);}}
function stopVoiceRecord(){if(!_mediaRecorder||!_isRecording)return;_isRecording=false;const micBtn=document.getElementById('chatMicBtn');const bar=document.getElementById('voiceRecordingBar');if(micBtn){micBtn.textContent='🎙️';micBtn.style.background='';micBtn.style.color='';}if(bar)bar.style.display='none';_mediaRecorder.stop();}
async function sendVoiceMessage(roomId,blob){try{toast('กำลังส่งเสียง...');const fd=new FormData();fd.append('voice',blob,'voice.webm');const result=await api.sendChatVoice(roomId,fd);const ml=document.getElementById('msgList');if(ml&&result){const div=document.createElement('div');div.innerHTML=renderMsg(result,state.user.id);ml.appendChild(div);ml.scrollTop=ml.scrollHeight;}}catch(e){toast('ส่งเสียงไม่สำเร็จ: '+e.message);}}

// ===== IMAGE SEARCH =====
async function doImageSearch(input){if(!input.files[0])return;const fd=new FormData();fd.append('image',input.files[0]);try{const panel=document.getElementById('imgSearchResults');const grid=document.getElementById('imgSearchGrid');const title=document.getElementById('imgSearchTitle');if(panel)panel.style.display='block';if(grid)grid.innerHTML='<div class="loading">กำลังวิเคราะห์รูปภาพ...</div>';if(title)title.textContent='📷 กำลังค้นหา...';const res=await api.imageSearch(fd);if(title)title.textContent=`📷 ผลจากคำค้น: "${res.keywords}"${res.category?' ('+res.category+')':''}`;renderImageSearchResults(res.products);input.value='';}catch(e){toast('ค้นหาด้วยรูปไม่สำเร็จ: '+e.message);const panel=document.getElementById('imgSearchResults');if(panel)panel.style.display='none';input.value='';}}
function renderImageSearchResults(products){const grid=document.getElementById('imgSearchGrid');if(!grid)return;if(!products||!products.length){grid.innerHTML='<div class="empty-state"><span class="empty-state-icon">🔍</span><h3>ไม่พบสินค้าที่ใกล้เคียง</h3><p>ลองใช้รูปภาพอื่น</p></div>';return;}grid.innerHTML=products.map(p=>{const img=p.image_url?`<img src="${imgSrc(p.image_url)}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 200%22><rect fill=%22%23f0f0f0%22 width=%22200%22 height=%22200%22/><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2248%22>📦</text></svg>'"/>`:' <div style="height:180px;display:flex;align-items:center;justify-content:center;font-size:48px">📦</div>';return `<div class="product-card" onclick="openDetail(${p.id})"><div class="card-img">${img}</div><div class="card-body"><div class="card-title">${p.title}</div><div class="card-price">฿${Number(p.price).toLocaleString()}</div></div></div>`;}).join('');}
function closeImageSearch(){const panel=document.getElementById('imgSearchResults');if(panel)panel.style.display='none';}

// ===== eKYC =====
async function openEkycVerify(){if(!state.user){openOverlay('loginOverlay');return;}try{const status=await api.getEkycStatus();const box=document.getElementById('ekycStatusBox');if(box){if(status.ekyc_verified){box.innerHTML=`<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:var(--radius);padding:16px;text-align:center"><div style="font-size:28px;margin-bottom:6px">🪪✅</div><div style="font-weight:700;color:#16a34a;margin-bottom:4px">ยืนยันตัวตนแล้ว!</div><div style="font-size:13px;color:var(--text-sec)">ชื่อ: ${status.ekyc_name||'-'}</div></div>`;}else{box.innerHTML=`<div style="background:var(--bg-sec);border-radius:var(--radius);padding:12px;font-size:13px;color:var(--text-sec)">ยังไม่ได้ยืนยันตัวตน — อัปโหลดบัตรประชาชนเพื่อรับ eKYC Badge</div>`;}}}catch(e){}openOverlay('ekycOverlay');}
function previewEkycImage(input){const file=input.files[0];if(!file)return;const prev=document.getElementById('ekycPreview');const ph=document.getElementById('ekycPlaceholder');const reader=new FileReader();reader.onload=e=>{prev.src=e.target.result;prev.style.display='block';if(ph)ph.style.display='none';};reader.readAsDataURL(file);}
async function doSubmitEkyc(){const input=document.getElementById('ekycFileInput');if(!input.files[0]){toast('กรุณาเลือกรูปบัตรประชาชน');return;}const fd=new FormData();fd.append('id_card',input.files[0]);try{toast('กำลังตรวจสอบ...');const res=await api.submitEkyc(fd);toast(res.message,'#1D9E75');closeOverlay('ekycOverlay');loadEkycStatus();}catch(e){toast(e.message||'ยืนยันตัวตนไม่สำเร็จ');}}
async function loadEkycStatus(){if(!state.user)return;try{const status=await api.getEkycStatus();const badge=document.getElementById('ekycBadge');if(badge){badge.textContent=status.ekyc_verified?'🪪 eKYC ✅':'🪪 ยังไม่ยืนยัน';badge.className=status.ekyc_verified?'ekyc-badge':'ekyc-badge ekyc-unverified';}}catch(e){}}

async function openNotifications(){if(!state.user){openOverlay('loginOverlay');return;}try{const res=await api.getNotifications();const list=document.getElementById('notifList');if(!res.notifications.length){list.innerHTML='<div class="empty-msg">ไม่มีการแจ้งเตือน</div>';goPage('notifications');return;}list.innerHTML=res.notifications.map(n=>`<div class="notif-item ${n.is_read?'':'unread'}" onclick="clickNotif(${n.id},'${n.link||''}','${n.type||''}')"><div class="notif-icon">${NICONS[n.type]||'📢'}</div><div style="flex:1"><div class="notif-title">${n.title}</div><div class="notif-body">${n.body}</div><div class="notif-time">${new Date(n.created_at).toLocaleString('th')}</div></div><button onclick="event.stopPropagation();delNotif(${n.id})" style="background:none;border:none;color:var(--text-hint);cursor:pointer;font-size:16px">×</button></div>`).join('');
  // mark all as read ทั้ง backend และ frontend
  if(res.unread>0){api.readAllNotifications().catch(()=>{});}
  state.notifCount=0;updateBadge('notifBadge',0);goPage('notifications');}catch(e){toast(e.message);}}
async function readAllNotifs(){try{await api.readAllNotifications();state.notifCount=0;updateBadge('notifBadge',0);openNotifications();}catch(e){toast(e.message);}}
async function delNotif(id){try{await api.deleteNotification(id);openNotifications();}catch(e){toast(e.message);}}
function clickNotif(id,link,type){
  if(type==='chat'||(link&&link.includes('chat'))){openChatList();return;}
  if(type==='order'||type==='payment'||(link&&link.includes('order'))){openProfile();profileTab('orders');return;}
  if(link&&link.match(/product[/-](\d+)/)){const m=link.match(/product[/-](\d+)/);if(m)openDetail(parseInt(m[1]));return;}
  goPage('notifications');
}

async function openAdmin(){if(!state.user?.is_admin){toast('ไม่มีสิทธิ์เข้าถึง');return;}try{const stats=await api.adminStats();document.getElementById('adminContent').innerHTML=`<h2 style="font-size:20px;font-weight:700;margin-bottom:20px">🛡️ Admin Panel</h2><div class="stat-cards"><div class="stat-card"><div class="stat-card-n">${stats.users}</div><div class="stat-card-l">ผู้ใช้ทั้งหมด</div></div><div class="stat-card"><div class="stat-card-n">${stats.products}</div><div class="stat-card-l">สินค้าทั้งหมด</div></div><div class="stat-card"><div class="stat-card-n">${stats.available}</div><div class="stat-card-l">วางขายอยู่</div></div><div class="stat-card"><div class="stat-card-n">${stats.sold}</div><div class="stat-card-l">ขายแล้ว</div></div><div class="stat-card"><div class="stat-card-n">${stats.orders}</div><div class="stat-card-l">คำสั่งซื้อ</div></div><div class="stat-card"><div class="stat-card-n">฿${Number(stats.revenue).toLocaleString()}</div><div class="stat-card-l">ยอดขายรวม</div></div></div><div class="admin-tabs"><div class="admin-tab on" id="atab-users" onclick="adminTab('users')">👤 ผู้ใช้งาน</div><div class="admin-tab" id="atab-products" onclick="adminTab('products')">📦 สินค้า</div><div class="admin-tab" id="atab-disputes" onclick="adminTab('disputes')">🚨 ข้อพิพาท</div><div class="admin-tab" id="atab-verify-requests" onclick="adminTab('verify-requests')">📋 คำขอ Verified</div><div class="admin-tab" id="atab-feedback" onclick="adminTab('feedback')">💬 Feedback</div><div class="admin-tab" id="atab-reports" onclick="adminTab('reports')">🚩 รายงาน</div></div><div id="adminTabContent"></div>`;goPage('admin');adminTab('users');}catch(e){toast(e.message);}}
function _userRow(u){const isSelf=state.user&&state.user.id===u.id;return `<tr><td>${u.id}</td><td>${u.name}${u.is_verified?'<span class="verified-badge" style="margin-left:4px">✅</span>':''}${u.is_admin?'<span style="font-size:10px;background:#ede9fe;color:#7c3aed;padding:2px 6px;border-radius:99px;margin-left:4px;font-weight:600">🛡️Admin</span>':''}</td><td style="font-size:12px">${u.email}</td><td>${u.rating}★</td><td><span style="font-size:12px;padding:3px 8px;border-radius:99px;background:${u.is_banned?'#fef2f2':u.is_admin?'#ede9fe':'#f0fdf4'};color:${u.is_banned?'#dc2626':u.is_admin?'#7c3aed':'#16a34a'}">${u.is_admin?'Admin':u.is_banned?'ถูกแบน':'ปกติ'}</span></td><td style="display:flex;gap:4px;flex-wrap:wrap">${isSelf?'<span style="font-size:12px;color:var(--text-hint)">(คุณ)</span>':`${!u.is_admin?`<button class="btn btn-sm ${u.is_banned?'btn-g':'btn-danger'}" onclick="adminBan(${u.id})">${u.is_banned?'ปลดแบน':'แบน'}</button>`:''}<button class="btn btn-sm" onclick="adminVerify(${u.id})">${u.is_verified?'✅ ถอดยืนยัน':'✅ ยืนยัน'}</button><button class="btn btn-sm" style="background:${u.is_admin?'#fef2f2':'#ede9fe'};color:${u.is_admin?'#dc2626':'#7c3aed'};border-color:${u.is_admin?'#fca5a5':'#c4b5fd'}" onclick="adminToggleAdmin(${u.id})">${u.is_admin?'🛡️ ถอด Admin':'🛡️ ให้ Admin'}</button>`}</td></tr>`;}
async function adminTab(tab){document.querySelectorAll('.admin-tab').forEach(t=>t.classList.toggle('on',t.id==='atab-'+tab));const c=document.getElementById('adminTabContent');if(tab==='users'){const users=await api.adminUsers();c.innerHTML=`<div style="margin-bottom:12px"><input id="adminUserQ" type="text" placeholder="ค้นหาผู้ใช้..." style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-sec);color:var(--text);font-size:14px;width:260px" oninput="adminSearchUsers()"/></div><div style="overflow-x:auto"><table class="data-table" id="usersTable"><thead><tr><th>ID</th><th>ชื่อ</th><th>อีเมล</th><th>คะแนน</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${users.map(_userRow).join('')}</tbody></table></div>`;}else if(tab==='disputes'){const disputes=await api.adminGetDisputes().catch(()=>[]);const statusColor={open:'#d97706',investigating:'#2563eb',resolved:'#16a34a',closed:'#6b7280'};const statusLabel={open:'🟡 เปิด',investigating:'🔵 กำลังตรวจ',resolved:'✅ แก้แล้ว',closed:'⬛ ปิด'};c.innerHTML=disputes.length?`<div style="margin-top:8px">${disputes.map(d=>`<div class="dispute-item dispute-${d.status}"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px"><div><div style="font-weight:600">ออเดอร์ #${String(d.order_id).padStart(4,'0')} — ${d.reason}</div><div style="font-size:12px;color:var(--text-sec)">โดย ${d.user_name} · ${new Date(d.created_at).toLocaleDateString('th')}</div></div><span style="font-size:12px;font-weight:600;color:${statusColor[d.status]||'#666'}">${statusLabel[d.status]||d.status}</span></div><div style="font-size:13px;color:var(--text-sec);margin-bottom:10px">${d.detail}</div>${d.evidence_url?`<img src="${d.evidence_url}" style="max-width:200px;border-radius:var(--radius);margin-bottom:10px;cursor:pointer" onclick="window.open(this.src)"/>`:''}<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm btn-g" onclick="resolveDispute(${d.id},'resolved')">✅ แก้แล้ว</button><button class="btn btn-sm" onclick="resolveDispute(${d.id},'investigating')">🔵 กำลังตรวจ</button><button class="btn btn-sm btn-danger" onclick="resolveDispute(${d.id},'closed')">⬛ ปิด</button></div></div>`).join('')}</div>`:'<div class="empty-state"><span class="empty-state-icon">🚨</span><h3>ไม่มีข้อพิพาท</h3></div>';}else if(tab==='verify-requests'){const vreqs=await api.adminGetVerifyRequests().catch(()=>[]);const sColor={pending:'#d97706',approved:'#16a34a',rejected:'#dc2626'};const sLabel={pending:'⏳ รอพิจารณา',approved:'✅ อนุมัติแล้ว',rejected:'❌ ปฏิเสธแล้ว'};c.innerHTML=vreqs.length?`<div style="margin-top:8px">${vreqs.map(v=>`<div class="dispute-item" style="border-left:3px solid ${sColor[v.status]||'#ccc'}"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px"><div><div style="font-weight:600">${v.name}${v.is_verified?'<span class="verified-badge" style="margin-left:6px">✅ Verified</span>':''}</div><div style="font-size:12px;color:var(--text-sec)">${v.email} · ⭐ ${v.rating} (${v.review_count} รีวิว) · 📦 ${v.product_count} สินค้า</div><div style="font-size:12px;color:var(--text-hint);margin-top:2px">${new Date(v.created_at).toLocaleDateString('th',{year:'numeric',month:'long',day:'numeric'})}</div></div><span style="font-size:12px;font-weight:600;color:${sColor[v.status]||'#666'};white-space:nowrap">${sLabel[v.status]||v.status}</span></div><div style="background:var(--bg-sec);border-radius:var(--radius);padding:10px;margin-bottom:10px;font-size:13px"><b>เหตุผล:</b> ${v.reason}</div>${v.id_card_url?`<div style="margin-bottom:10px"><img src="${v.id_card_url}" style="max-width:220px;border-radius:var(--radius);cursor:pointer" onclick="window.open(this.src)"/></div>`:''} ${v.admin_note?`<div style="font-size:12px;color:var(--text-sec);margin-bottom:8px">📝 หมายเหตุ: ${v.admin_note}</div>`:''} ${v.status==='pending'?`<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start;flex-direction:column"><div style="display:flex;gap:6px"><button class="btn btn-sm btn-g" onclick="handleVerifyRequest(${v.id},'approve')">✅ อนุมัติ</button><button class="btn btn-sm btn-danger" id="vreject-btn-${v.id}" onclick="handleVerifyRequest(${v.id},'reject')">❌ ปฏิเสธ</button></div><div id="vreject-note-${v.id}" style="display:none;width:100%"><textarea id="vreject-note-input-${v.id}" placeholder="เหตุผลที่ปฏิเสธ (ไม่บังคับ)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-sec);color:var(--text);font-size:13px;resize:vertical;margin-bottom:6px;box-sizing:border-box"></textarea><button class="btn btn-sm btn-danger" onclick="submitRejectVerify(${v.id})">ยืนยันปฏิเสธ</button><button class="btn btn-sm" onclick="adminTab('verify-requests')" style="margin-left:4px">ยกเลิก</button></div></div>`:''}</div>`).join('')}</div>`:'<div class="empty-state"><span class="empty-state-icon">📋</span><h3>ไม่มีคำขอ</h3><p>ยังไม่มีผู้ใช้ส่งคำขอ Verified Badge</p></div>';}else if(tab==='reports'){const rpts=await api.adminGetReports().catch(()=>[]);const rColor={pending:'#d97706',reviewed:'#2563eb',resolved:'#16a34a'};const rLabel={pending:'⏳ รอดำเนินการ',reviewed:'🔵 รับเรื่องแล้ว',resolved:'✅ แก้ไขแล้ว'};c.innerHTML=rpts.length?`<div style="margin-top:8px">${rpts.map(r=>`<div class="dispute-item" style="border-left:3px solid ${rColor[r.status]||'#ccc'}"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px"><div><div style="font-weight:600">🚩 ${r.product_title||'สินค้า #'+r.product_id}</div><div style="font-size:12px;color:var(--text-sec)">โดย ${r.reporter_name} · ${new Date(r.created_at).toLocaleDateString('th',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div></div><span style="font-size:12px;font-weight:600;color:${rColor[r.status]||'#666'};white-space:nowrap">${rLabel[r.status]||r.status}</span></div><div style="background:var(--bg-sec);border-radius:var(--radius);padding:8px 10px;margin-bottom:8px;font-size:13px"><b>เหตุผล:</b> ${r.reason}${r.detail?`<br><span style="color:var(--text-sec)">${r.detail}</span>`:''}</div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm" onclick="adminUpdateReport(${r.id},'reviewed')">🔵 รับเรื่องแล้ว</button><button class="btn btn-sm btn-g" onclick="adminUpdateReport(${r.id},'resolved')">✅ แก้ไขแล้ว</button><button class="btn btn-sm" onclick="goToProduct(${r.product_id})">📦 ดูสินค้า</button></div></div>`).join('')}</div>`:'<div class="empty-state"><span class="empty-state-icon">🚩</span><h3>ไม่มีรายงาน</h3></div>';}else if(tab==='feedback'){const fbCatLabel={bug:'🐛 แจ้งบัค',feature:'💡 เสนอ Feature',complaint:'😤 ร้องเรียน',review:'💬 ติชม',keep:'⭐ ฟังก์ชั่นที่ดี',other:'📌 อื่นๆ'};const fbs=await api.adminGetFeedback().catch(()=>[]);c.innerHTML=fbs.length?`<div style="margin-top:8px">${fbs.map(f=>`<div class="dispute-item" style="border-left:3px solid ${f.is_read?'#d1d5db':'#6366f1'};opacity:${f.is_read?'.7':'1'}"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px"><div><span style="font-size:12px;font-weight:600;background:${f.is_read?'#f3f4f6':'#eef2ff'};color:${f.is_read?'#6b7280':'#6366f1'};padding:2px 8px;border-radius:99px">${fbCatLabel[f.category]||f.category}</span>${f.sender_name?`<span style="font-size:12px;color:var(--text-sec);margin-left:8px">👤 ${f.sender_name}</span>`:''}</div><div style="display:flex;align-items:center;gap:6px"><span style="font-size:11px;color:var(--text-hint)">${new Date(f.created_at).toLocaleDateString('th',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>${!f.is_read?`<button class="btn btn-sm btn-g" onclick="markFeedbackRead(${f.id})">✓ อ่านแล้ว</button>`:''}</div></div><div style="font-size:14px;color:var(--text);margin-bottom:8px;line-height:1.5">${f.message}</div>${f.sender_email?`<div style="font-size:12px;color:var(--text-sec)">📧 ${f.sender_email}</div>`:''}</div>`).join('')}</div>`:'<div class="empty-state"><span class="empty-state-icon">💬</span><h3>ยังไม่มี Feedback</h3></div>';}else{const products=await api.adminProducts({});c.innerHTML=`<div style="margin-bottom:12px;display:flex;gap:8px"><input id="adminProdQ" type="text" placeholder="ค้นหาสินค้า..." style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-sec);color:var(--text);font-size:14px;width:220px" oninput="adminSearchProducts()"/><select id="adminProdStatus" onchange="adminSearchProducts()" style="padding:8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-sec);color:var(--text);font-size:13px"><option value="">สถานะทั้งหมด</option><option value="available">วางขาย</option><option value="sold">ขายแล้ว</option></select></div><div style="overflow-x:auto"><table class="data-table" id="productsTable"><thead><tr><th>ID</th><th>ชื่อสินค้า</th><th>ราคา</th><th>ผู้ขาย</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${products.map(p=>`<tr><td>${p.id}</td><td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.title}</td><td>฿${Number(p.price).toLocaleString()}</td><td>${p.seller_name}</td><td><span style="font-size:12px;padding:3px 8px;border-radius:99px;background:${p.status==='available'?'#f0fdf4':'#f9fafb'};color:${p.status==='available'?'#16a34a':'#6b7280'}">${p.status==='available'?'วางขาย':'ขายแล้ว'}</span></td><td style="display:flex;gap:4px"><button class="btn btn-sm" onclick="adminToggleProduct(${p.id},'${p.status==='available'?'sold':'available'}')">${p.status==='available'?'ปิด':'เปิด'}</button><button class="btn btn-sm btn-danger" onclick="adminDelProduct(${p.id})">ลบ</button></td></tr>`).join('')}</tbody></table></div>`;}}
async function adminSearchUsers(){const q=document.getElementById('adminUserQ')?.value;const users=await api.adminUsers(q);document.querySelector('#usersTable tbody').innerHTML=users.map(_userRow).join('');}
async function adminVerify(id){try{const r=await api.adminVerifySeller(id);toast(r.message,'#1D9E75');adminTab('users');}catch(e){toast(e.message);}}
async function adminToggleAdmin(id){if(!confirm('เปลี่ยนสิทธิ์ Admin ของผู้ใช้นี้?'))return;try{const r=await api.adminToggleAdmin(id);toast(r.message,'#7c3aed');adminTab('users');}catch(e){toast(e.message);}}
async function resolveDispute(id,status){try{await api.adminUpdateDispute(id,status,null);toast('อัปเดตสถานะแล้ว ✅','#1D9E75');adminTab('disputes');}catch(e){toast(e.message);}}
async function handleVerifyRequest(id,action){
  if(action==='reject'){
    // แสดง inline input สำหรับเหตุผลปฏิเสธ
    const btnEl=document.getElementById('vreject-btn-'+id);
    const noteEl=document.getElementById('vreject-note-'+id);
    if(!noteEl){toast('เกิดข้อผิดพลาด');return;}
    noteEl.style.display='block';
    if(btnEl)btnEl.style.display='none';
    return;
  }
  try{
    const r=await api.adminHandleVerifyRequest(id,action,null);
    toast(r.message,'#1D9E75');
    adminTab('verify-requests');
  }catch(e){toast(e.message);}
}
async function submitRejectVerify(id){
  const note=document.getElementById('vreject-note-input-'+id)?.value||'';
  try{
    const r=await api.adminHandleVerifyRequest(id,'reject',note||null);
    toast(r.message);
    adminTab('verify-requests');
  }catch(e){toast(e.message);}
}

// ===== VERIFIED STATUS TAB (User Profile) =====
async function openVerifiedStatusTab(){
  const c=document.getElementById('profileTabContent');
  c.innerHTML='<div class="loading">กำลังโหลด...</div>';
  try{
    const me=JSON.parse(localStorage.getItem('user')||'null');
    const[userInfo,req]=await Promise.all([api.getSeller(me.id),api.getMyVerifyRequest()]);
    const isVerified=userInfo.is_verified;
    const sColor={pending:'#d97706',approved:'#16a34a',rejected:'#dc2626'};
    const sLabel={pending:'⏳ รอ Admin พิจารณา',approved:'✅ อนุมัติแล้ว',rejected:'❌ ถูกปฏิเสธ'};
    let html='<div style="margin-top:16px">';
    if(isVerified){
      html+=`<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:var(--radius);padding:20px;text-align:center;margin-bottom:16px"><div style="font-size:36px;margin-bottom:8px">✅</div><div style="font-size:18px;font-weight:700;color:#16a34a;margin-bottom:4px">บัญชีของคุณได้รับการ Verified แล้ว!</div><div style="font-size:13px;color:var(--text-sec)">Verified Badge จะแสดงในโปรไฟล์และสินค้าของคุณ แสดงถึงความน่าเชื่อถือ</div></div>`;
    } else if(req){
      html+=`<div style="background:var(--bg-sec);border-radius:var(--radius);padding:16px;margin-bottom:16px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div style="font-weight:600">คำขอ Verified Badge</div><span style="font-size:13px;font-weight:600;color:${sColor[req.status]||'#666'}">${sLabel[req.status]||req.status}</span></div><div style="font-size:13px;color:var(--text-sec);margin-bottom:8px"><b>เหตุผล:</b> ${req.reason}</div>${req.admin_note?`<div style="font-size:13px;color:#dc2626;margin-bottom:8px">💬 Admin: ${req.admin_note}</div>`:''}<div style="font-size:12px;color:var(--text-hint)">ส่งเมื่อ ${new Date(req.created_at).toLocaleDateString('th',{year:'numeric',month:'long',day:'numeric'})}</div></div>`;
      if(req.status==='rejected'){
        html+=`<p style="font-size:13px;color:var(--text-sec);margin-bottom:12px">คำขอถูกปฏิเสธ คุณสามารถส่งคำขอใหม่ได้</p><button class="btn btn-g" onclick="openVerifyRequestModal()">📋 ส่งคำขอใหม่</button>`;
      }
    } else {
      html+=`<div style="background:var(--bg-sec);border-radius:var(--radius);padding:20px;text-align:center;margin-bottom:16px"><div style="font-size:32px;margin-bottom:8px">🏅</div><div style="font-size:16px;font-weight:600;margin-bottom:8px">ขอ Verified Badge</div><div style="font-size:13px;color:var(--text-sec);margin-bottom:16px">Verified Badge ช่วยเพิ่มความน่าเชื่อถือ ทำให้ผู้ซื้อมั่นใจในตัวคุณมากขึ้น</div><ul style="text-align:left;font-size:13px;color:var(--text-sec);margin:0 auto 16px;padding-left:20px;max-width:300px"><li>ชื่อของคุณจะมีเครื่องหมาย ✅</li><li>Admin จะตรวจสอบคำขอภายใน 1-3 วัน</li><li>คุณจะได้รับการแจ้งเตือนเมื่อผลออก</li></ul><button class="btn btn-g" onclick="openVerifyRequestModal()">✅ ส่งคำขอ Verified Badge</button></div>`;
    }
    html+='</div>';
    c.innerHTML=html;
  }catch(e){c.innerHTML='<div class="empty-msg">โหลดไม่สำเร็จ</div>';toast(e.message);}
}

function openVerifyRequestModal(){
  document.getElementById('verifyReason').value='';
  openOverlay('verifyRequestOverlay');
}
async function doSubmitVerifyRequest(){
  const reason=document.getElementById('verifyReason').value.trim();
  if(!reason){toast('กรุณาระบุเหตุผล');return;}
  try{
    const res=await api.submitVerifyRequest(reason);
    closeOverlay('verifyRequestOverlay');
    toast(res.message,'#1D9E75');
    profileTab('verified-status');
  }catch(e){toast(e.message);}
}
async function adminSearchProducts(){const q=document.getElementById('adminProdQ')?.value,status=document.getElementById('adminProdStatus')?.value;const products=await api.adminProducts({q,status});document.querySelector('#productsTable tbody').innerHTML=products.map(p=>`<tr><td>${p.id}</td><td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.title}</td><td>฿${Number(p.price).toLocaleString()}</td><td>${p.seller_name}</td><td><span style="font-size:12px;padding:3px 8px;border-radius:99px;background:${p.status==='available'?'#f0fdf4':'#f9fafb'};color:${p.status==='available'?'#16a34a':'#6b7280'}">${p.status==='available'?'วางขาย':'ขายแล้ว'}</span></td><td style="display:flex;gap:4px"><button class="btn btn-sm" onclick="adminToggleProduct(${p.id},'${p.status==='available'?'sold':'available'}')">${p.status==='available'?'ปิด':'เปิด'}</button><button class="btn btn-sm btn-danger" onclick="adminDelProduct(${p.id})">ลบ</button></td></tr>`).join('');}
async function adminBan(id){try{const r=await api.adminBanUser(id);toast(r.message);adminTab('users');}catch(e){toast(e.message);}}
async function adminDelProduct(id){if(!confirm('ลบสินค้านี้?'))return;try{await api.adminDeleteProduct(id);toast('ลบแล้ว');adminTab('products');}catch(e){toast(e.message);}}
async function adminToggleProduct(id,status){try{await api.adminUpdateProductStatus(id,status);adminTab('products');}catch(e){toast(e.message);}}

function connectSocket(){if(!state.token||socket)return;socket=window.io(CONFIG.API_URL,{auth:{token:state.token}});socket.on('new_message',msg=>{if(msg.room_id!==currentRoomId)return;const ml=document.getElementById('msgList');if(!ml)return;const div=document.createElement('div');div.innerHTML=renderMsg(msg,state.user.id);ml.appendChild(div);ml.scrollTop=ml.scrollHeight;});socket.on('notification',data=>{if(data&&data.type==='chat'){state.chatCount++;updateBadge('chatBadge',state.chatCount);}else{state.notifCount++;updateBadge('notifBadge',state.notifCount);}});}

async function syncBadges(){if(!state.user)return;try{const[cart,wl,notifs,chatUnread]=await Promise.all([api.getCart(),api.getWishlist(),api.getNotifications(),api.getChatUnread().catch(()=>({unread:0}))]);state.cartCount=cart.reduce((s,x)=>s+x.qty,0);state.wlCount=wl.length;state.wlIds=wl.map(x=>x.product_id);state.notifCount=notifs.unread;state.chatCount=chatUnread.unread||0;updateBadge('cartBadge',state.cartCount);updateBadge('wlBadge',state.wlCount);updateBadge('notifBadge',state.notifCount);updateBadge('chatBadge',state.chatCount);}catch{}}

async function init(){
  initDarkMode();
  updateNav();

  const hash=window.location.hash;
  const hashId=hash.startsWith('#product-')?parseInt(hash.replace('#product-','')):null;

  if(hashId&&!isNaN(hashId)){
    // มี deep link → ข้ามไปหน้า detail ทันที ไม่โชว์ home
    goPage('detail');
    document.getElementById('detailContent').innerHTML='<div class="loading" style="padding:80px 0;text-align:center;grid-column:1/-1">กำลังโหลดสินค้า...</div>';
    // โหลด products หลังบ้าน (ไม่ await)
    loadProducts();
    if(state.user){syncBadges();connectSocket();}
    openDetail(hashId);
  } else {
    await loadProducts();
    if(state.user){await syncBadges();connectSocket();}
  }

  loadTrending();
  loadStories();

  window.addEventListener('hashchange',()=>{
    const h=window.location.hash;
    if(h.startsWith('#product-')){const id=parseInt(h.replace('#product-',''));if(!isNaN(id))openDetail(id);}
    else if(!h||h==='#'){goPage('home');}
  });
}
init();

function goPageClearHash(p){window.location.hash='';goPage(p);}
// Override back button on detail page to clear hash
document.querySelector('#page-detail .back-btn')?.addEventListener('click',()=>{window.location.hash='';});

function openAdvSearch(){/* placeholder – filters are inline */}

// ===== PromptPay QR =====
function tlv(tag, val){return tag+String(val.length).padStart(2,'0')+val;}
function crc16(str){let c=0xFFFF;for(let i=0;i<str.length;i++){c^=str.charCodeAt(i)<<8;for(let j=0;j<8;j++)c=c&0x8000?(c<<1)^0x1021:c<<1;}return(c&0xFFFF).toString(16).toUpperCase().padStart(4,'0');}
function buildPromptPayPayload(phone,amount){
  let id=phone.replace(/[^0-9]/g,'');
  let subtag='01';
  if(id.length===13){subtag='02';id='0013'+id;} // เลขบัตรประชาชน
  else if(id.length===10&&id.startsWith('0')){id='0066'+id.slice(1);} // เบอร์มือถือ
  const acc=tlv('00','A000000677010111')+tlv(subtag,id);
  let p=tlv('00','01')+tlv('01',amount?'12':'11')+tlv('29',acc)+tlv('53','764')+(amount?tlv('54',Number(amount).toFixed(2)):'')+tlv('58','TH')+tlv('59','PromptPay')+tlv('60','Bangkok')+'6304';
  return p+crc16(p);
}

function showPaymentQR(orderId, total, promptpay, sellerName, bankName, bankAccount, bankAccountName){
  document.getElementById('paymentOrderId').value=orderId;
  document.getElementById('paymentSellerName').textContent=sellerName||'ผู้ขาย';
  document.getElementById('paymentAmount').textContent='฿'+Number(total).toLocaleString();
  document.getElementById('slipPreview').style.display='none';
  document.getElementById('slipImg').value='';
  document.getElementById('slipPlaceholder').style.display='';
  // Bank transfer section
  const bankSection=document.getElementById('paymentBankSection');
  if(bankName&&bankAccount){
    document.getElementById('paymentBankName').textContent=bankName;
    document.getElementById('paymentBankAccount').textContent=bankAccount;
    document.getElementById('paymentBankAccountName').textContent=bankAccountName||'';
    bankSection.style.display='';
  } else {
    bankSection.style.display='none';
  }
  // PromptPay QR section
  const container=document.getElementById('qrContainer');
  container.innerHTML='';
  if(promptpay){
    document.getElementById('paymentPromptpay').textContent='PromptPay: '+promptpay;
    document.getElementById('paymentQRSection').style.display='';
    try{
      const payload=buildPromptPayPayload(promptpay, total);
      new QRCode(container,{text:payload,width:200,height:200,colorDark:'#000',colorLight:'#fff',correctLevel:QRCode.CorrectLevel.M});
    }catch(e){container.innerHTML='<div style="color:var(--text-hint);font-size:13px">ไม่สามารถสร้าง QR ได้</div>';}
  } else {
    document.getElementById('paymentQRSection').style.display='none';
  }
  // ถ้าไม่มีทั้งคู่
  if(!promptpay&&(!bankName||!bankAccount)){
    document.getElementById('paymentQRSection').style.display='';
    container.innerHTML=`<div style="text-align:center;padding:20px;background:var(--bg-sec);border-radius:var(--radius-lg);color:var(--text-sec);font-size:14px;line-height:1.6">ℹ️ ผู้ขายยังไม่ได้ตั้งค่าช่องทางรับเงิน<br><span style="font-size:13px">กรุณาติดต่อผู้ขายผ่าน 💬 Chat</span></div>`;
  }
  openOverlay('paymentOverlay');
  goPage('home');
}
function showPaymentFromOrder(id){
  const o=(window._payOrders||{})[id];
  if(!o)return;
  showPaymentQR(o.id,o.total,o.seller_promptpay||null,o.seller_name||'ผู้ขาย',o.seller_bank_name||null,o.seller_bank_account||null,o.seller_bank_account_name||null);
}
function closePaymentModal(){
  closeOverlay('paymentOverlay');
  if(window._newOrder){window._newOrder=false;toast('สร้างคำสั่งซื้อแล้ว! 📦 ไปที่ "ประวัติซื้อ" เพื่อส่ง slip','#1D9E75');}
}
function previewSlip(input){
  if(!input.files[0])return;
  const reader=new FileReader();
  reader.onload=e=>{
    document.getElementById('slipPreview').src=e.target.result;
    document.getElementById('slipPreview').style.display='block';
    document.getElementById('slipPlaceholder').style.display='none';
  };
  reader.readAsDataURL(input.files[0]);
}
async function doSubmitSlip(){
  const orderId=document.getElementById('paymentOrderId').value;
  const file=document.getElementById('slipImg').files[0];
  if(!file){toast('กรุณาแนบ slip ก่อน');return;}
  const fd=new FormData();
  fd.append('slip',file);
  try{
    const res=await api.submitSlip(orderId,fd);
    closeOverlay('paymentOverlay');
    toast(res.message,'#1D9E75');
  }catch(e){toast(e.message);}
}
async function savePromptpay(){
  const val=document.getElementById('promptpayInput').value.trim();
  try{
    const res=await api.savePromptpay(val);
    toast(res.message,'#1D9E75');
  }catch(e){toast(e.message);}
}
async function doConfirmPayment(orderId){
  if(!confirm('ยืนยันว่าได้รับเงินแล้ว?'))return;
  try{
    const res=await api.confirmPayment(orderId);
    toast(res.message,'#1D9E75');
    profileTab('selling');
  }catch(e){toast(e.message);}
}

// ===== Recently Viewed =====
function addRecentlyViewed(p){
  try{
    let rv=JSON.parse(localStorage.getItem('recentlyViewed')||'[]');
    rv=rv.filter(x=>x.id!==p.id);
    rv.unshift({id:p.id,title:p.title,price:p.price,image_url:p.image_url,category:p.category,condition:p.condition,seller_name:p.seller_name,original_price:p.original_price,delivery_method:p.delivery_method});
    rv=rv.slice(0,10);
    localStorage.setItem('recentlyViewed',JSON.stringify(rv));
  }catch{}
}
function renderRecentlyViewed(){
  try{
    const rv=JSON.parse(localStorage.getItem('recentlyViewed')||'[]');
    const sec=document.getElementById('recentlyViewedSection');
    if(!sec)return;
    if(!rv.length){sec.classList.add('hidden');return;}
    sec.classList.remove('hidden');
    const scroll=document.getElementById('recentlyViewedGrid');
    scroll.innerHTML=rv.map(p=>{
      const thumb=p.image_url
        ?`<img class="rv-card-thumb" src="${imgSrc(p.image_url)}" alt="${p.title}" loading="lazy"/>`
        :`<div class="rv-card-emoji">${EMOJIS[p.category]||'📦'}</div>`;
      return `<div class="rv-card" onclick="openDetail(${p.id})">${thumb}<div class="rv-card-body"><div class="rv-card-title">${p.title}</div><div class="rv-card-price">฿${Number(p.price).toLocaleString()}</div></div></div>`;
    }).join('');
  }catch{}
}

// ===== Search Suggestions =====
function showSuggestions(q){
  const box=document.getElementById('searchSuggestions');
  if(!box)return;
  if(!q||q.length<1){box.classList.add('hidden');return;}
  const all=window._allProducts||[];
  const cats=['มือถือ','เสื้อผ้า','หนังสือ','กีฬา','ของแต่งบ้าน','กล้อง'];
  const ql=q.toLowerCase();
  const titles=[...new Set(all.filter(p=>p.title.toLowerCase().includes(ql)).map(p=>p.title))].slice(0,4);
  const matchCats=cats.filter(c=>c.includes(q)).slice(0,2);
  const items=[...titles,...matchCats.filter(c=>!titles.includes(c))];
  if(!items.length){box.classList.add('hidden');return;}
  box.innerHTML=items.map(s=>`<div class="suggestion-item" onmousedown="selectSuggestion('${s.replace(/'/g,"\\'")}')">${EMOJIS[s]||'🔍'} ${s}</div>`).join('');
  box.classList.remove('hidden');
}
function selectSuggestion(val){
  document.getElementById('searchQ').value=val;
  document.getElementById('searchSuggestions').classList.add('hidden');
  loadProducts();
}
function hideSuggestions(){setTimeout(()=>document.getElementById('searchSuggestions')?.classList.add('hidden'),150);}

// ===== Order Status =====
function markOrderReceived(id){
  window._confirmReceiveId=id;
  openOverlay('confirmReceivedOverlay');
}
async function confirmReceived(){
  closeOverlay('confirmReceivedOverlay');
  try{
    const res=await api.markOrderReceived(window._confirmReceiveId);
    toast(res.message,'#1D9E75');
    profileTab('orders');
  }catch(e){toast(e.message);}
}

async function doCancelOrder(id){
  if(!confirm('ยืนยันยกเลิกคำสั่งซื้อ?\nสินค้าจะกลับมาวางขายอีกครั้ง'))return;
  try{
    const res=await api.cancelOrder(id);
    toast(res.message,'#1D9E75');
    profileTab('orders');
  }catch(e){toast(e.message);}
}

async function doSellerCancel(id){
  if(!confirm('ยืนยันยกเลิกออเดอร์นี้?\n\n⚠️ ถ้าผู้ซื้อโอนเงินมาแล้ว คุณต้องโอนเงินคืนให้ผู้ซื้อเองนอกระบบ\nสินค้าจะกลับมาวางขายอีกครั้ง'))return;
  try{
    const res=await api.sellerCancelOrder(id);
    toast(res.message,'#1D9E75');
    profileTab('selling');
  }catch(e){toast(e.message);}
}

async function doShipOrder(id, shipping_status){
  if(shipping_status==='preparing'){
    try{const res=await api.shipOrder(id,'preparing');toast(res.message,'#1D9E75');profileTab('selling');}catch(e){toast(e.message);}
    return;
  }
  window._shipOrderId=id;
  document.getElementById('trackingInput').value='';
  document.getElementById('trackingCarrier').value='';
  document.getElementById('trackingCarrierCustom').style.display='none';
  document.getElementById('trackingCarrierCustom').value='';
  openOverlay('trackingOverlay');
}
function toggleCarrierCustom(){
  const sel=document.getElementById('trackingCarrier');
  const inp=document.getElementById('trackingCarrierCustom');
  if(sel.value==='__custom__'){inp.style.display='block';inp.focus();}
  else{inp.style.display='none';inp.value='';}
}
function _getTrackingCarrier(){
  const sel=document.getElementById('trackingCarrier');
  if(sel.value==='__custom__') return document.getElementById('trackingCarrierCustom').value.trim()||null;
  return sel.value||null;
}

async function confirmShipWithTracking(){
  const tracking=document.getElementById('trackingInput').value.trim()||null;
  const carrier=_getTrackingCarrier();
  closeOverlay('trackingOverlay');
  try{
    const res=await api.shipOrder(window._shipOrderId,'shipped',tracking,carrier);
    toast(res.message,'#1D9E75');
    profileTab('selling');
  }catch(e){toast(e.message);}
}

// ===== Tracking URL Helper =====
function _trackingUrl(carrier, trackingNumber){
  const t=encodeURIComponent(trackingNumber||'');
  const map={
    'EMS':'https://track.thailandpost.co.th/tracking/?barcode='+t,
    'Kerry':'https://th.kerryexpress.com/th/track/?track='+t,
    'Flash':'https://www.flashexpress.co.th/tracking/?se='+t,
    'J&T':'https://www.jtexpress.co.th/trajectoryQuery?waybillNo='+t,
    'Ninja Van':'https://www.ninjavan.co/th-th/tracking?id='+t,
    'DHL':'https://www.dhl.com/th-th/home/tracking/tracking-parcel.html?submit=1&tracking-id='+t,
    'SCG':'https://scgexpress.co.th/'+t,
  };
  return map[carrier]||'https://www.google.com/search?q='+encodeURIComponent((carrier||'tracking')+' '+trackingNumber);
}

// ===== AI Features =====
async function aiWriteDesc(prefix){
  const title=document.getElementById(prefix+'Title')?.value||'';
  const cat=document.getElementById(prefix+'Cat')?.value||'';
  const cond=document.getElementById(prefix+'Cond')?.value||'';
  const existing=document.getElementById(prefix+'Desc')?.value||'';
  if(!title){toast('กรุณาใส่ชื่อสินค้าก่อน ✏️');return;}
  const btn=document.getElementById(prefix+'AiBtn');
  if(btn){btn.disabled=true;btn.textContent='⏳ กำลังเขียน...';}
  try{
    const res=await api.aiDescription(title,cat,cond,existing);
    const ta=document.getElementById(prefix+'Desc');
    if(ta){ta.value=res.description;ta.focus();}
    toast('AI เขียนให้แล้ว ✨','#6366f1');
  }catch(e){toast(e.message||'AI ไม่พร้อมใช้งาน');}
  finally{if(btn){btn.disabled=false;btn.textContent='✨ AI เขียนให้';}}
}

async function aiPriceSuggest(prefix){
  const cat=document.getElementById(prefix+'Cat')?.value||'';
  const cond=document.getElementById(prefix+'Cond')?.value||'';
  if(!cat){toast('กรุณาเลือกหมวดหมู่ก่อน');return;}
  const box=document.getElementById(prefix+'PriceSuggest');
  if(box){box.style.display='block';box.innerHTML='<span style="color:var(--text-sec)">⏳ กำลังวิเคราะห์ราคาตลาด...</span>';}
  try{
    const d=await api.aiPriceSuggest(cat,cond);
    if(!d.count){
      if(box)box.innerHTML='<span style="color:var(--text-sec)">ยังไม่มีข้อมูลราคาในหมวดนี้</span>';
      return;
    }
    if(box)box.innerHTML=`
      <div style="font-weight:700;margin-bottom:6px;color:var(--green)">💡 ราคาตลาด: ${cat}${cond?' · '+cond:''}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px;text-align:center">
        <div style="background:var(--bg-sec);border-radius:6px;padding:6px"><div style="font-size:11px;color:var(--text-sec)">ต่ำสุด</div><div style="font-weight:700">฿${Number(d.min).toLocaleString()}</div></div>
        <div style="background:#f0fdf4;border-radius:6px;padding:6px;border:1px solid #86efac"><div style="font-size:11px;color:var(--green)">แนะนำ</div><div style="font-weight:700;color:var(--green)">฿${Number(d.suggested).toLocaleString()}</div></div>
        <div style="background:var(--bg-sec);border-radius:6px;padding:6px"><div style="font-size:11px;color:var(--text-sec)">สูงสุด</div><div style="font-weight:700">฿${Number(d.max).toLocaleString()}</div></div>
      </div>
      <div style="font-size:12px;color:var(--text-sec);margin-bottom:6px">เฉลี่ย ฿${Number(d.avg).toLocaleString()} · จาก ${d.count} รายการ</div>
      <button class="ai-btn" style="font-size:12px" onclick="document.getElementById('${prefix}Price').value=${d.suggested}">ใช้ราคาแนะนำ ฿${Number(d.suggested).toLocaleString()}</button>`;
  }catch(e){if(box)box.innerHTML='<span style="color:#ef4444">โหลดข้อมูลไม่ได้</span>';}
}

// ── New Image Preview with Drag & Drop (ใช้ได้ทั้ง sell และ edit) ──
let _newImgDragIdx = null;

function _renderNewImgGrid(files, gridEl, inputId, isEdit) {
  gridEl.innerHTML = '';
  if (!files.length) return;
  const hasExisting = isEdit && _editImgs.length > 0;
  // สร้าง div ตามลำดับก่อน เพื่อให้ DOM order ถูกต้องเสมอ
  const divs = Array.from(files).map((file, i) => {
    const div = document.createElement('div');
    div.className = 'edit-img-item';
    div.draggable = true;
    div.dataset.idx = i;
    div.style.cssText = 'position:relative;cursor:grab';
    const showCover = i === 0 && !hasExisting;
    div.innerHTML = `
      <img data-idx="${i}" style="width:100%;height:100%;object-fit:cover"/>
      ${showCover ? '<span class="edit-img-first-badge">หน้าปก</span>' : ''}
      <span style="position:absolute;top:3px;left:4px;font-size:10px;font-weight:700;color:#fff;background:rgba(0,0,0,.45);border-radius:3px;padding:1px 5px;pointer-events:none">${i+1}</span>
      <button class="${isEdit?'edit-img-del':'remove-img'}" onclick="removeNewImg(${i},'${inputId}')" title="ลบรูปนี้">${isEdit?'✕':'×'}</button>
      <div style="position:absolute;bottom:2px;right:2px;font-size:13px;opacity:.4;pointer-events:none">⠿</div>`;
    div.addEventListener('dragstart', ev => {
      _newImgDragIdx = i;
      div.classList.add('dragging');
      ev.dataTransfer.effectAllowed = 'move';
    });
    div.addEventListener('dragover', ev => {
      ev.preventDefault();
      gridEl.querySelectorAll('.edit-img-item').forEach(el => el.classList.remove('drag-over'));
      div.classList.add('drag-over');
    });
    div.addEventListener('drop', ev => {
      ev.preventDefault();
      const targetIdx = parseInt(div.dataset.idx);
      if (_newImgDragIdx === null || _newImgDragIdx === targetIdx) return;
      const input = document.getElementById(inputId);
      const arr = Array.from(input.files);
      const moved = arr.splice(_newImgDragIdx, 1)[0];
      arr.splice(targetIdx, 0, moved);
      const dt = new DataTransfer();
      arr.forEach(f => dt.items.add(f));
      input.files = dt.files;
      if (isEdit) previewEditImages(input);
      else previewImages(input);
    });
    div.addEventListener('dragend', () => {
      gridEl.querySelectorAll('.edit-img-item,.img-preview-item').forEach(el => el.classList.remove('dragging','drag-over'));
      _newImgDragIdx = null;
    });
    gridEl.appendChild(div); // append ตามลำดับทันที
    return div;
  });
  // โหลด src แยกต่างหาก ไม่กระทบลำดับ DOM
  Array.from(files).forEach((file, i) => {
    const reader = new FileReader();
    reader.onload = e => {
      divs[i].querySelector('img').src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// สะสมไฟล์ข้ามการเปิด file picker หลายครั้ง
const _accFiles = {};
function _mergeIntoInput(input) {
  const prev = _accFiles[input.id] || [];
  const added = Array.from(input.files);
  const merged = [...prev, ...added].slice(0, 10); // max 10
  const dt = new DataTransfer();
  merged.forEach(f => dt.items.add(f));
  input.files = dt.files;
  _accFiles[input.id] = merged;
}
function _clearAccFiles(inputId) {
  _accFiles[inputId] = [];
  const input = document.getElementById(inputId);
  if (input) { const dt = new DataTransfer(); input.files = dt.files; }
}

function removeNewImg(index, inputId) {
  const input = document.getElementById(inputId);
  const dt = new DataTransfer();
  Array.from(input.files).forEach((f, i) => { if (i !== index) dt.items.add(f); });
  input.files = dt.files;
  _accFiles[inputId] = Array.from(dt.files); // sync accumulator
  if (inputId === 'eImgNew') previewEditImages(input, true);
  else previewImages(input, true);
}

function previewImages(input, skipMerge = false) {
  if (!skipMerge) _mergeIntoInput(input);
  const grid = document.getElementById('imgPreviewGrid');
  const wrap = document.getElementById('imgUploadWrap');
  grid.innerHTML = '';
  if (!input.files.length) {
    wrap.innerHTML = `<div style="font-size:48px;margin-bottom:8px">📸</div><div style="font-size:15px;font-weight:600;color:var(--green);margin-bottom:4px">กดที่นี่เพื่อเลือกรูป</div><div style="font-size:12px;color:var(--text-hint)">เลือกได้สูงสุด 10 รูป · JPG, PNG ไม่เกิน 5MB/รูป</div>`;
    return;
  }
  wrap.innerHTML = `<div style="font-size:15px;font-weight:600;color:var(--green)">📷 เลือกแล้ว ${input.files.length} รูป</div><div style="font-size:12px;color:var(--text-hint);margin-top:4px">กดเพื่อเพิ่มรูปอีก · ลากเพื่อเรียงลำดับ</div>`;
  _renderNewImgGrid(input.files, grid, 'sImg', false);
}

function removePreviewImg(index) { removeNewImg(index, 'sImg'); }

function previewEditImages(input, skipMerge = false) {
  if (!skipMerge) _mergeIntoInput(input);
  const preview = document.getElementById('eImgNewPreview');
  preview.innerHTML = '';
  if (!input.files.length) return;
  _renderNewImgGrid(input.files, preview, 'eImgNew', true);
}

function removeEditNewImg(index) { removeNewImg(index, 'eImgNew'); }

// ── Edit Image Grid with Drag & Drop ──────────────────────
let _editImgs = [];

function renderEditImgGrid(imgs, productId) {
  _editImgs = imgs.filter(img => img.id); // เฉพาะรูปที่มี id (จาก DB)
  const grid = document.getElementById('eImgGrid');
  if (!_editImgs.length) {
    grid.innerHTML = '<div style="font-size:12px;color:var(--text-hint);padding:8px 0">ไม่มีรูปภาพ — กดเพิ่มรูปใหม่ด้านล่าง</div>';
    return;
  }
  grid.innerHTML = _editImgs.map((img, i) => `
    <div class="edit-img-item" id="eimg-${img.id}" draggable="true"
      data-id="${img.id}"
      ondragstart="editImgDragStart(event)"
      ondragover="editImgDragOver(event)"
      ondrop="editImgDrop(event,${productId})"
      ondragend="editImgDragEnd(event)">
      <img src="${imgSrc(img.url)}" style="width:100%;height:100%;object-fit:cover"/>
      ${i === 0 ? '<span class="edit-img-first-badge">หน้าปก</span>' : ''}
      <button class="edit-img-del" onclick="deleteProductImage(${productId},${img.id})" title="ลบรูปนี้">✕</button>
      <div style="position:absolute;bottom:2px;right:2px;font-size:14px;opacity:.5;pointer-events:none">⠿</div>
    </div>`).join('');
}

let _dragSrcId = null;

function editImgDragStart(e) {
  _dragSrcId = e.currentTarget.dataset.id;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function editImgDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.edit-img-item').forEach(el => el.classList.remove('drag-over'));
  e.currentTarget.classList.add('drag-over');
}

async function editImgDrop(e, productId) {
  e.preventDefault();
  const targetId = e.currentTarget.dataset.id;
  if (!_dragSrcId || _dragSrcId === targetId) return;

  // สลับตำแหน่งใน array
  const srcIdx = _editImgs.findIndex(img => String(img.id) === String(_dragSrcId));
  const tgtIdx = _editImgs.findIndex(img => String(img.id) === String(targetId));
  if (srcIdx === -1 || tgtIdx === -1) return;
  const moved = _editImgs.splice(srcIdx, 1)[0];
  _editImgs.splice(tgtIdx, 0, moved);

  renderEditImgGrid(_editImgs, productId);

  // บันทึกลำดับใหม่ไปยัง server
  try {
    await api.reorderProductImages(productId, _editImgs.map(img => img.id));
    toast('เรียงลำดับรูปแล้ว ✅', '#1D9E75');
  } catch(err) { toast(err.message); }
}

function editImgDragEnd(e) {
  document.querySelectorAll('.edit-img-item').forEach(el => {
    el.classList.remove('dragging', 'drag-over');
  });
  _dragSrcId = null;
}

function buildGallery(product) {
  const images = product.images && product.images.length > 0 ? product.images : (product.image_url ? [{url: product.image_url}] : []);
  if (!images.length) return `<div class="detail-main-img"><span class="emoji">${EMOJIS[product.category]||'📦'}</span></div>`;
  const imgUrls = images.map(img => imgSrc(img.url));
  window._galleryImages = imgUrls;
  window._lbCurrentIndex = 0;
  return `
    <div class="detail-gallery">
      <div class="detail-main-img" id="mainImgWrap" style="cursor:zoom-in" onclick="openLightbox(window._galleryImages, window._lbCurrentIndex||0)">
        <img src="${imgSrc(images[0].url)}" id="mainImg" alt="${product.title}"/>
      </div>
      ${images.length > 1 ? `<div class="detail-thumbs">${images.map((img, i) => `
        <div class="detail-thumb ${i===0?'active':''}" onclick="switchImgLb('${imgSrc(img.url)}', this, ${i})">
          <img src="${imgSrc(img.url)}" alt="thumb"/>
        </div>`).join('')}</div>` : ''}
    </div>`;
}

function switchImgLb(url, el, idx) {
  window._lbCurrentIndex = idx;
  document.getElementById('mainImg').src = url;
  document.querySelectorAll('.detail-thumb').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}

// ===== Feature 4: Categories Page =====
const CATEGORIES=[{name:'ทั้งหมด',emoji:'🛍️'},{name:'มือถือ',emoji:'📱'},{name:'เสื้อผ้า',emoji:'👗'},{name:'หนังสือ',emoji:'📚'},{name:'กีฬา',emoji:'⚽'},{name:'ของแต่งบ้าน',emoji:'🏠'},{name:'กล้อง',emoji:'📷'},{name:'อื่นๆ',emoji:'📦'}];
function openCategories(){
  const pg=document.getElementById('page-categories');
  if(!pg)return;
  pg.querySelector('#catPageGrid').innerHTML=CATEGORIES.map(c=>`<div class="cat-card" onclick="selectCategory('${c.name}')"><div class="cat-card-emoji">${c.emoji}</div><div class="cat-card-name">${c.name}</div></div>`).join('');
  goPage('categories');
}
function selectCategory(cat){
  state.cat=cat;
  const chips=document.querySelectorAll('.chip');
  chips.forEach(c=>{const onclick=c.getAttribute('onclick')||'';c.classList.toggle('on',onclick.includes("setCat('"+cat+"'"));});
  goPage('home');
}

// ===== Feature 5: Pull-to-Refresh =====
let _touchStartY=0;
document.addEventListener('touchstart',e=>{_touchStartY=e.touches[0].clientY;},{passive:true});
document.addEventListener('touchend',e=>{
  const diff=e.changedTouches[0].clientY-_touchStartY;
  const page=document.querySelector('.page.active');
  if(diff>80&&page?.id==='page-home'&&window.scrollY===0){loadProducts();toast('🔄 รีเฟรชแล้ว','#1D9E75');}
},{passive:true});

// ===== Feature 6: Infinite Scroll =====
async function loadProducts(){
  _productPage=1;_productDone=false;
  const q=document.getElementById('searchQ').value,minPrice=document.getElementById('minP').value,maxPrice=document.getElementById('maxP').value,sort=document.getElementById('sortSel').value,condition=document.getElementById('condSel').value,location=document.getElementById('locationSel').value;
  document.getElementById('productGrid').innerHTML=Array(8).fill('<div class="skeleton-card"><div class="skeleton skeleton-img"></div><div class="skeleton-body"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></div></div>').join('');
  try{const params={page:1,limit:_productLimit};if(state.cat!=='ทั้งหมด')params.cat=state.cat;if(q)params.q=q;if(minPrice)params.minPrice=minPrice;if(maxPrice)params.maxPrice=maxPrice;if(sort)params.sort=sort;if(condition)params.condition=condition;if(location)params.location=location;const products=await api.getProducts(params);window._allProducts=(window._allProducts||[]);if(!q&&!minPrice&&!maxPrice&&!condition&&!location&&state.cat==='ทั้งหมด')window._allProducts=products;document.getElementById('statCount').textContent=products.length+'+';renderCards(products,'productGrid');renderRecentlyViewed();if(products.length<_productLimit)_productDone=true;}
  catch(e){document.getElementById('productGrid').innerHTML='<div class="empty-msg">โหลดไม่สำเร็จ</div>';}
}

async function _loadMoreProducts(){
  if(_productLoading||_productDone)return;
  _productLoading=true;
  _productPage++;
  const q=document.getElementById('searchQ').value,minPrice=document.getElementById('minP').value,maxPrice=document.getElementById('maxP').value,sort=document.getElementById('sortSel').value,condition=document.getElementById('condSel').value,location=document.getElementById('locationSel').value;
  try{const params={page:_productPage,limit:_productLimit};if(state.cat!=='ทั้งหมด')params.cat=state.cat;if(q)params.q=q;if(minPrice)params.minPrice=minPrice;if(maxPrice)params.maxPrice=maxPrice;if(sort)params.sort=sort;if(condition)params.condition=condition;if(location)params.location=location;const products=await api.getProducts(params);if(!products.length){_productDone=true;}else{const g=document.getElementById('productGrid');const sentinel=document.getElementById('scrollSentinel');const frag=document.createDocumentFragment();products.forEach(p=>{const div=document.createElement('div');div.className='card';div.onclick=()=>openDetail(p.id);const priceHtml=p.original_price?`<div class="card-price">฿${Number(p.price).toLocaleString()} <span class="original-price">฿${Number(p.original_price).toLocaleString()}</span></div>`:`<div class="card-price">฿${Number(p.price).toLocaleString()}</div>`;div.innerHTML=`<div class="card-img">${productImg(p)}${p.original_price?'<span class="price-drop-badge">ลดราคา</span>':''}${p.status==='reserved'?'<span class="reserved-badge">รอยืนยัน</span>':''}</div><div class="card-body"><div class="card-title">${p.title}</div>${priceHtml}<div class="card-foot"><span class="cond ${CMAP[p.condition||p.cond]||''}">${p.condition||p.cond}</span><span class="seller-nm">${p.seller_name||p.location||''}</span></div></div>`;frag.appendChild(div);});if(sentinel)g.insertBefore(frag,sentinel);else g.appendChild(frag);if(products.length<_productLimit)_productDone=true;}}
  catch{}finally{_productLoading=false;}
}

// Set up IntersectionObserver for sentinel
(function(){const sentinel=document.getElementById('scrollSentinel');if(!sentinel)return;const obs=new IntersectionObserver(entries=>{if(entries[0].isIntersecting)_loadMoreProducts();},{rootMargin:'200px'});obs.observe(sentinel);})();

// ===== DARK MODE =====
function initDarkMode(){
  const saved=localStorage.getItem('theme');
  if(saved){document.documentElement.setAttribute('data-theme',saved);document.getElementById('darkToggle').textContent=saved==='dark'?'☀️':'🌙';}
  else if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.setAttribute('data-theme','dark');document.getElementById('darkToggle').textContent='☀️';}
}
function toggleDarkMode(){
  const cur=document.documentElement.getAttribute('data-theme');
  const next=cur==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  localStorage.setItem('theme',next);
  document.getElementById('darkToggle').textContent=next==='dark'?'☀️':'🌙';
}

// ===== LIGHTBOX =====
let lbImages=[],lbIndex=0;
function openLightbox(images,idx=0){
  lbImages=images;lbIndex=idx;
  document.getElementById('lbImg').src=images[idx];
  document.getElementById('lbCounter').textContent=images.length>1?`${idx+1} / ${images.length}`:'';
  document.getElementById('lb-prev').style.display=images.length>1?'flex':'none';
  document.getElementById('lb-next').style.display=images.length>1?'flex':'none';
  document.getElementById('lightbox').classList.add('open');
}
function closeLightbox(){document.getElementById('lightbox').classList.remove('open');}
function lbNav(dir){
  lbIndex=(lbIndex+dir+lbImages.length)%lbImages.length;
  document.getElementById('lbImg').src=lbImages[lbIndex];
  document.getElementById('lbCounter').textContent=lbImages.length>1?`${lbIndex+1} / ${lbImages.length}`:'';
}
document.addEventListener('keydown',e=>{if(!document.getElementById('lightbox').classList.contains('open'))return;if(e.key==='ArrowLeft')lbNav(-1);else if(e.key==='ArrowRight')lbNav(1);else if(e.key==='Escape')closeLightbox();});

// ===== TRENDING =====
async function loadTrending(){
  try{
    const products=await api.getTrending();
    const section=document.getElementById('trendingSection');
    const scroll=document.getElementById('trendingScroll');
    if(!section||!scroll)return;
    if(!products||!products.length){section.style.display='none';return;}
    scroll.innerHTML=products.map(p=>{
      const thumb=p.image_url?`<img src="${imgSrc(p.image_url)}" alt="${p.title}" loading="lazy"/>` :`<div style="width:100%;height:100px;display:flex;align-items:center;justify-content:center;font-size:32px;background:var(--bg-sec)">${EMOJIS[p.category]||'📦'}</div>`;
      return `<div class="trending-card" onclick="openDetail(${p.id})">${thumb}<div class="trending-card-body"><div class="trending-card-title">${p.title}</div><div class="trending-card-price">฿${Number(p.price).toLocaleString()}</div></div></div>`;
    }).join('');
    section.style.display='block';
  }catch(e){console.warn('loadTrending error:',e);}
}

// ===== SKELETON LOADING =====
function showSkeletons(gridId,count=6){
  const g=document.getElementById(gridId);
  if(!g)return;
  g.innerHTML=Array(count).fill(0).map(()=>`
    <div class="skel-card">
      <div class="skel-img skeleton"></div>
      <div class="skel-body">
        <div class="skel-line skeleton"></div>
        <div class="skel-line short skeleton"></div>
      </div>
    </div>`).join('');
}

// ===== SHOP PROFILE =====
function openShopEdit(){
  const me=JSON.parse(localStorage.getItem('user')||'null');
  if(!me)return;
  api.getShop(me.id).then(shop=>{
    document.getElementById('shopName').value=shop.shop_name||'';
    document.getElementById('shopBio').value=shop.shop_bio||'';
    document.getElementById('shopBannerPreview').style.display=shop.shop_banner?'block':'none';
    if(shop.shop_banner)document.getElementById('shopBannerPreview').src=imgSrc(shop.shop_banner);
    openOverlay('shopEditOverlay');
  }).catch(()=>openOverlay('shopEditOverlay'));
}
function previewShopBanner(input){
  if(!input.files[0])return;
  const reader=new FileReader();
  reader.onload=e=>{
    const prev=document.getElementById('shopBannerPreview');
    prev.src=e.target.result;prev.style.display='block';
  };
  reader.readAsDataURL(input.files[0]);
}
async function doSaveShop(){
  const name=document.getElementById('shopName').value.trim();
  const bio=document.getElementById('shopBio').value.trim();
  const bannerFile=document.getElementById('shopBannerInput').files[0];
  try{
    await api.updateShop({shop_name:name,shop_bio:bio});
    if(bannerFile){
      const fd=new FormData();fd.append('banner',bannerFile);
      await api.uploadShopBanner(fd);
    }
    closeOverlay('shopEditOverlay');
    toast('บันทึกข้อมูลร้านแล้ว ✅','#1D9E75');
  }catch(e){toast(e.message);}
}

// ===== BANK ACCOUNT =====
function openBankModal(){
  const me=JSON.parse(localStorage.getItem('user')||'null');
  if(!me)return;
  api.getSeller(me.id).then(u=>{
    document.getElementById('bankName').value=u.bank_name||'';
    document.getElementById('bankAccount').value=u.bank_account||'';
    document.getElementById('bankAccountName').value=u.bank_account_name||'';
    openOverlay('bankOverlay');
  }).catch(()=>openOverlay('bankOverlay'));
}
async function doSaveBank(){
  const bank_name=document.getElementById('bankName').value;
  const bank_account=document.getElementById('bankAccount').value.trim();
  const bank_account_name=document.getElementById('bankAccountName').value.trim();
  if(!bank_name||!bank_account||!bank_account_name){toast('กรุณากรอกข้อมูลให้ครบ');return;}
  try{
    await api.saveBank({bank_name,bank_account,bank_account_name});
    closeOverlay('bankOverlay');
    toast('บันทึกบัญชีธนาคารแล้ว ✅','#1D9E75');
  }catch(e){toast(e.message);}
}

// ===== ADDRESS BOOK =====
async function openAddressesTab(){
  const c=document.getElementById('profileTabContent');
  c.innerHTML='<div class="loading">กำลังโหลด...</div>';
  try{
    const addrs=await api.getAddresses();
    const html=addrs.length?addrs.map(a=>`
      <div class="address-item ${a.is_default?'default-addr':''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
          <div>
            <span style="font-weight:600">${a.label}</span>
            ${a.is_default?'<span class="addr-default-badge" style="margin-left:8px">ค่าเริ่มต้น</span>':''}
          </div>
          <div style="display:flex;gap:6px">
            ${!a.is_default?`<button class="btn btn-sm btn-g" onclick="setDefaultAddr(${a.id})">ตั้งเป็นหลัก</button>`:''}
            <button class="btn btn-sm" onclick="openEditAddress(${a.id})">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="deleteAddr(${a.id})">🗑️</button>
          </div>
        </div>
        <div style="font-size:14px">${a.recipient_name} · ${a.phone}</div>
        <div style="font-size:13px;color:var(--text-sec);margin-top:2px">${a.address} ${a.province}</div>
      </div>`).join(''):'<div class="empty-state"><span class="empty-state-icon">📍</span><h3>ยังไม่มีที่อยู่</h3><p>เพิ่มที่อยู่จัดส่งเพื่อความสะดวกในการสั่งซื้อ</p></div>';
    c.innerHTML=`<div style="margin-top:16px">
      <button class="btn btn-g" style="margin-bottom:16px;width:100%" onclick="openAddAddress()">+ เพิ่มที่อยู่ใหม่</button>
      ${html}
    </div>`;
  }catch(e){toast(e.message);}
}
function openAddAddress(){
  document.getElementById('addressModalTitle').textContent='➕ เพิ่มที่อยู่';
  document.getElementById('editAddressId').value='';
  ['addrLabel','addrName','addrPhone','addrAddress','addrProvince'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('addrLabel').value='บ้าน';
  openOverlay('addressOverlay');
}
async function openEditAddress(id){
  const addrs=await api.getAddresses().catch(()=>[]);
  const a=addrs.find(x=>x.id===id);
  if(!a)return;
  document.getElementById('addressModalTitle').textContent='✏️ แก้ไขที่อยู่';
  document.getElementById('editAddressId').value=id;
  document.getElementById('addrLabel').value=a.label;
  document.getElementById('addrName').value=a.recipient_name;
  document.getElementById('addrPhone').value=a.phone;
  document.getElementById('addrAddress').value=a.address;
  document.getElementById('addrProvince').value=a.province;
  openOverlay('addressOverlay');
}
async function doSaveAddress(){
  const id=document.getElementById('editAddressId').value;
  const data={label:document.getElementById('addrLabel').value||'บ้าน',recipient_name:document.getElementById('addrName').value.trim(),phone:document.getElementById('addrPhone').value.trim(),address:document.getElementById('addrAddress').value.trim(),province:document.getElementById('addrProvince').value.trim()};
  if(!data.recipient_name||!data.phone||!data.address||!data.province){toast('กรุณากรอกข้อมูลให้ครบ');return;}
  try{
    if(id)await api.updateAddress(id,data);
    else await api.createAddress(data);
    closeOverlay('addressOverlay');
    toast('บันทึกที่อยู่แล้ว ✅','#1D9E75');
    openAddressesTab();profileTab('addresses');
  }catch(e){toast(e.message);}
}
async function setDefaultAddr(id){try{await api.setDefaultAddress(id);toast('ตั้งที่อยู่หลักแล้ว ✅','#1D9E75');openAddressesTab();profileTab('addresses');}catch(e){toast(e.message);}}
async function deleteAddr(id){if(!confirm('ลบที่อยู่นี้?'))return;try{await api.deleteAddress(id);toast('ลบที่อยู่แล้ว');openAddressesTab();profileTab('addresses');}catch(e){toast(e.message);}}

// ===== TRANSACTIONS =====
async function openTransactionsTab(){
  const c=document.getElementById('profileTabContent');
  c.innerHTML='<div class="loading">กำลังโหลด...</div>';
  try{
    const txs=await api.getTransactions();
    if(!txs.length){c.innerHTML='<div class="empty-state"><span class="empty-state-icon">💰</span><h3>ยังไม่มีธุรกรรม</h3><p>ธุรกรรมจะแสดงเมื่อมีออเดอร์ที่เสร็จสิ้นแล้ว</p></div>';return;}
    const total=txs.reduce((s,t)=>s+Number(t.total),0);
    c.innerHTML=`<div style="margin-top:16px">
      <div class="tx-summary">
        <div style="font-size:13px;color:var(--green-dark);margin-bottom:4px">รายรับทั้งหมด</div>
        <div class="tx-total">฿${total.toLocaleString()}</div>
        <div style="font-size:12px;color:var(--green-dark);margin-top:4px">${txs.length} ออเดอร์</div>
      </div>
      ${txs.map(t=>`<div class="tx-item">
        <div>
          <div style="font-size:13px;font-weight:500">${t.items}</div>
          <div class="tx-detail">${t.buyer_name} · ${new Date(t.created_at).toLocaleDateString('th',{year:'numeric',month:'short',day:'numeric'})}</div>
        </div>
        <div class="tx-amount">+฿${Number(t.total).toLocaleString()}</div>
      </div>`).join('')}
    </div>`;
  }catch(e){toast(e.message);}
}

// ===== PROMO CODES =====
function updatePromoLabel(){const t=document.getElementById('promoType').value;document.getElementById('promoValLabel').textContent=t==='percent'?'ส่วนลด (%)':'ส่วนลด (฿)';}
async function openPromoTab(){
  const c=document.getElementById('profileTabContent');
  c.innerHTML='<div class="loading">กำลังโหลด...</div>';
  try{
    const promos=await api.getMyPromos();
    c.innerHTML=`<div style="margin-top:16px">
      <button class="btn btn-g" style="width:100%;margin-bottom:16px" onclick="openOverlay('promoOverlay')">+ สร้างโปรโมโค้ด</button>
      ${promos.length?promos.map(p=>{
        const disc=p.discount_type==='percent'?`ลด ${p.discount_value}%`:`ลด ฿${Number(p.discount_value).toLocaleString()}`;
        const exp=p.expires_at?`หมดอายุ ${new Date(p.expires_at).toLocaleDateString('th')}`:'ไม่หมดอายุ';
        const used=p.uses_limit?`ใช้แล้ว ${p.uses_count}/${p.uses_limit} ครั้ง`:`ใช้แล้ว ${p.uses_count} ครั้ง`;
        return `<div class="promo-item ${p.is_active?'':'promo-inactive'}">
          <div>
            <div class="promo-code">${p.code}</div>
            <div class="promo-detail">${disc} ${p.min_order>0?`· ขั้นต่ำ ฿${Number(p.min_order).toLocaleString()}`:''} · ${used} · ${exp}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn btn-sm ${p.is_active?'btn-danger':''}" onclick="togglePromoCode(${p.id})">${p.is_active?'ปิด':'เปิด'}</button>
            <button class="btn btn-sm btn-danger" onclick="deletePromoCode(${p.id})">🗑️</button>
          </div>
        </div>`;
      }).join(''):'<div class="empty-state"><span class="empty-state-icon">🎁</span><h3>ยังไม่มีโปรโมโค้ด</h3><p>สร้างโปรโมโค้ดเพื่อดึงดูดผู้ซื้อ</p></div>'}
    </div>`;
  }catch(e){toast(e.message);}
}
async function doCreatePromo(){
  const code=document.getElementById('promoCode').value.trim().toUpperCase();
  const discount_type=document.getElementById('promoType').value;
  const discount_value=Number(document.getElementById('promoValue').value);
  const min_order=Number(document.getElementById('promoMinOrder').value)||0;
  const uses_limit=document.getElementById('promoLimit').value?Number(document.getElementById('promoLimit').value):null;
  const expires_at=document.getElementById('promoExpiry').value||null;
  if(!code||!discount_value){toast('กรุณากรอกรหัสโค้ดและส่วนลด');return;}
  try{
    await api.createPromo({code,discount_type,discount_value,min_order,uses_limit,expires_at});
    closeOverlay('promoOverlay');
    toast('สร้างโปรโมโค้ดแล้ว 🎁','#1D9E75');
    profileTab('promo');
  }catch(e){toast(e.message);}
}
async function togglePromoCode(id){try{const r=await api.togglePromo(id);toast(r.message,'#1D9E75');profileTab('promo');}catch(e){toast(e.message);}}
async function deletePromoCode(id){if(!confirm('ลบโปรโมโค้ดนี้?'))return;try{await api.deletePromo(id);toast('ลบโค้ดแล้ว');profileTab('promo');}catch(e){toast(e.message);}}

// ===== SAVED SEARCHES =====
async function openSavedSearchesTab(){
  const c=document.getElementById('profileTabContent');
  c.innerHTML='<div class="loading">กำลังโหลด...</div>';
  try{
    const searches=await api.getSavedSearches();
    c.innerHTML=`<div style="margin-top:16px">
      <button class="btn btn-g" style="width:100%;margin-bottom:16px" onclick="openOverlay('savedSearchOverlay')">+ เพิ่มการแจ้งเตือน</button>
      ${searches.length?searches.map(s=>`
        <div class="saved-search-item">
          <div style="flex:1">
            <div class="saved-search-q">${s.keyword||'(ทุกสินค้า)'}</div>
            <div class="saved-search-meta">${s.category!=='ทั้งหมด'?s.category+' · ':''} ${s.max_price?'ไม่เกิน ฿'+Number(s.max_price).toLocaleString():''}</div>
          </div>
          <button class="btn btn-sm btn-danger" onclick="deleteSavedSearch(${s.id})">🗑️</button>
        </div>`).join(''):'<div class="empty-state"><span class="empty-state-icon">🔔</span><h3>ยังไม่มีการแจ้งเตือน</h3><p>บันทึกการค้นหาเพื่อรับแจ้งเตือนเมื่อมีสินค้าใหม่</p></div>'}
    </div>`;
  }catch(e){toast(e.message);}
}
async function doSaveSearch(){
  const keyword=document.getElementById('ssKeyword').value.trim();
  const category=document.getElementById('ssCategory').value;
  const max_price=document.getElementById('ssMaxPrice').value?Number(document.getElementById('ssMaxPrice').value):null;
  if(!keyword&&category==='ทั้งหมด'&&!max_price){toast('กรุณาระบุอย่างน้อยคีย์เวิร์ดหรือหมวดหมู่');return;}
  try{
    await api.createSavedSearch(keyword,category,max_price);
    closeOverlay('savedSearchOverlay');
    toast('บันทึกการแจ้งเตือนแล้ว 🔔','#1D9E75');
    profileTab('saved-searches');
  }catch(e){toast(e.message);}
}
async function deleteSavedSearch(id){try{await api.deleteSavedSearch(id);toast('ลบการแจ้งเตือนแล้ว');profileTab('saved-searches');}catch(e){toast(e.message);}}

// ===== DISPUTES =====
function openDisputeModal(orderId){
  if(!state.user){openOverlay('loginOverlay');return;}
  document.getElementById('disputeOrderId').value=orderId;
  document.getElementById('disputeDetail').value='';
  document.getElementById('disputeEvidence').value='';
  openOverlay('disputeOverlay');
}
async function doOpenDispute(){
  const orderId=document.getElementById('disputeOrderId').value;
  const reason=document.getElementById('disputeReason').value;
  const detail=document.getElementById('disputeDetail').value.trim();
  if(!detail){toast('กรุณาอธิบายปัญหา');return;}
  const fd=new FormData();
  fd.append('order_id',orderId);fd.append('reason',reason);fd.append('detail',detail);
  const evFile=document.getElementById('disputeEvidence').files[0];
  if(evFile)fd.append('evidence',evFile);
  try{
    const res=await api.openDispute(fd);
    closeOverlay('disputeOverlay');
    toast(res.message,'#1D9E75');
  }catch(e){toast(e.message);}
}

// ===== BUYER REVIEW =====
function openBuyerReviewModal(orderId){
  if(!state.user){openOverlay('loginOverlay');return;}
  document.getElementById('buyerReviewOrderId').value=orderId;
  document.getElementById('buyerReviewComment').value='';
  state.buyerStarRating=0;setBuyerStar(0);
  openOverlay('buyerReviewOverlay');
}
function setBuyerStar(n){state.buyerStarRating=n;document.querySelectorAll('#buyerStarPicker .star').forEach((s,i)=>s.classList.toggle('on',i<n));}
async function doBuyerReview(){
  const orderId=document.getElementById('buyerReviewOrderId').value;
  const comment=document.getElementById('buyerReviewComment').value;
  if(!state.buyerStarRating){toast('กรุณาให้คะแนนก่อน');return;}
  try{
    await api.postBuyerReview(orderId,state.buyerStarRating,comment);
    closeOverlay('buyerReviewOverlay');
    toast('รีวิวผู้ซื้อแล้ว ⭐','#1D9E75');
    profileTab('selling');
  }catch(e){toast(e.message);}
}

async function markFeedbackRead(id){try{await api.adminUpdateFeedback(id,{is_read:1});adminTab('feedback');}catch(e){toast(e.message);}}
async function adminUpdateReport(id,status){try{await api.adminUpdateReport(id,status);toast('อัปเดตแล้ว ✅','#1D9E75');adminTab('reports');}catch(e){toast(e.message);}}
function goToProduct(id){openDetail(id).catch(()=>toast('ไม่พบสินค้า'));}

// ===== FEEDBACK =====
function openFeedbackModal(){
  document.getElementById('feedbackCategory').value='';
  document.getElementById('feedbackMessage').value='';
  document.getElementById('feedbackName').value='';
  document.getElementById('feedbackEmail').value='';
  openOverlay('feedbackOverlay');
}
async function doSubmitFeedback(){
  const category=document.getElementById('feedbackCategory').value;
  const message=document.getElementById('feedbackMessage').value.trim();
  const sender_name=document.getElementById('feedbackName').value.trim();
  const sender_email=document.getElementById('feedbackEmail').value.trim();
  if(!category){toast('กรุณาเลือกหมวดหมู่');return;}
  if(!message||message.length<5){toast('กรุณาระบุข้อความอย่างน้อย 5 ตัวอักษร');return;}
  try{
    const res=await api.submitFeedback(category,message,sender_name||null,sender_email||null);
    closeOverlay('feedbackOverlay');
    toast(res.message,'#6366f1');
  }catch(e){toast(e.message);}
}

// ===== FLASH SALE =====
function startFlashCountdowns(){
  document.querySelectorAll('[data-flash-end]').forEach(el=>{
    const end=new Date(el.dataset.flashEnd);
    if(el._flashTimer)return;
    el._flashTimer=true;
    function tick(){
      const diff=end-Date.now();
      if(diff<=0){el.textContent='หมดเวลา';return;}
      const h=Math.floor(diff/3600000),m=Math.floor((diff%3600000)/60000),s=Math.floor((diff%60000)/1000);
      el.textContent=`⏱ ${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      setTimeout(tick,1000);
    }
    tick();
  });
}
function openFlashModal(id,price){
  if(!state.user){openOverlay('loginOverlay');return;}
  openOverlay('flashOverlay');
  document.getElementById('flashProductId').value=id;
  document.getElementById('flashProductPrice').textContent='฿'+Number(price).toLocaleString();
  document.getElementById('flashPrice').value='';
  document.getElementById('flashHours').value='2';
}
async function doSetFlash(){
  const id=document.getElementById('flashProductId').value;
  const flash_price=document.getElementById('flashPrice').value;
  const duration_hours=document.getElementById('flashHours').value;
  if(!flash_price||flash_price<=0){toast('กรุณาใส่ราคา Flash Sale');return;}
  try{const r=await api.setFlashSale(id,Number(flash_price),Number(duration_hours));toast(r.message,'#dc2626');closeOverlay('flashOverlay');openDetail(id);}
  catch(e){toast(e.message);}
}
async function doCancelFlash(id){
  try{const r=await api.cancelFlashSale(id);toast(r.message,'#1D9E75');openDetail(id);}
  catch(e){toast(e.message);}
}

// ===== RESERVE =====
async function doReserve(id){
  if(!state.user){openOverlay('loginOverlay');return;}
  if(!confirm('ต้องการจองสินค้านี้ไหม? ผู้ขายจะได้รับการแจ้งเตือน'))return;
  try{const r=await api.reserveProduct(id);toast(r.message,'#1D9E75');openDetail(id);}
  catch(e){toast(e.message);}
}
async function respondReserve(id,action){
  try{const r=await api.respondReservation(id,action);toast(r.message,'#1D9E75');profileTab('products');}
  catch(e){toast(e.message);}
}

// ===== BUNDLE =====
async function loadBundleSection(){
  try{
    const bundles=await api.getBundles();
    const wrap=document.getElementById('bundleSection');
    if(!wrap)return;
    if(!bundles.length){wrap.style.display='none';return;}
    wrap.style.display='';
    wrap.innerHTML=`<div class="section-title" style="padding:0 0 8px"><span>🎁 Bundle Deal</span></div>
      <div class="bundle-scroll">${bundles.map(b=>{
        const ids=JSON.parse(b.product_ids||'[]');
        return `<div class="bundle-card" onclick="openBundleDetail(${b.id})">
          <div class="bundle-tag">🎁 ${ids.length} ชิ้น</div>
          <div class="bundle-title">${b.title}</div>
          <div class="bundle-price">฿${Number(b.bundle_price).toLocaleString()}</div>
          <div class="bundle-seller">${b.seller_name}</div>
        </div>`;}).join('')}</div>`;
  }catch{}
}
async function openBundleDetail(id){
  try{
    const b=await api.getBundleDetail(id);
    const savings=b.total_original-Number(b.bundle_price);
    openOverlay('bundleOverlay');
    document.getElementById('bundleOverlayContent').innerHTML=`
      <h2>🎁 ${b.title}</h2>
      <div style="font-size:13px;color:var(--text-sec);margin-bottom:12px">โดย ${b.seller_name}</div>
      <div style="margin-bottom:12px">${(b.products||[]).map(p=>`
        <div style="display:flex;align-items:center;gap:10px;padding:8px;background:var(--bg-sec);border-radius:var(--radius);margin-bottom:6px">
          <div style="font-size:20px">${EMOJIS[p.category]||'📦'}</div>
          <div style="flex:1"><div style="font-size:14px;font-weight:500">${p.title}</div>
          <div style="font-size:12px;color:var(--text-sec)">฿${Number(p.price).toLocaleString()}</div></div>
        </div>`).join('')}</div>
      <div style="background:#fef9c3;border-radius:var(--radius);padding:12px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:13px;color:var(--text-sec)">ราคาปกติรวม</span>
          <span style="font-size:13px;text-decoration:line-through">฿${Number(b.total_original).toLocaleString()}</span>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="font-size:15px;font-weight:700;color:#16a34a">ราคา Bundle</span>
          <span style="font-size:18px;font-weight:700;color:#16a34a">฿${Number(b.bundle_price).toLocaleString()}</span>
        </div>
        <div style="font-size:12px;color:#16a34a;text-align:right">ประหยัด ฿${Number(savings).toLocaleString()}</div>
      </div>
      <button class="btn btn-g" style="width:100%" onclick="buyBundle(${JSON.stringify(b.products||[]).replace(/"/g,'&quot;')})">🛒 ซื้อ Bundle</button>`;
  }catch(e){toast(e.message);}
}
async function buyBundle(products){
  if(!state.user){closeOverlay('bundleOverlay');openOverlay('loginOverlay');return;}
  try{
    for(const p of products) await api.addCart(p.id).catch(()=>{});
    closeOverlay('bundleOverlay');
    state.cartCount+=products.length;updateBadge('cartBadge',state.cartCount);
    toast('เพิ่ม Bundle ในตะกร้าแล้ว! 🎁','#1D9E75');
    openCart();
  }catch(e){toast(e.message);}
}

// ===== HOLIDAY MODE =====
async function toggleHolidayMode(){
  const current=state.user?.holiday_mode;
  const newMode=!current;
  let msg='',until='';
  if(newMode){
    msg=prompt('ข้อความสำหรับลูกค้า (กด OK เว้นว่างไว้ก็ได้)','ร้านปิดชั่วคราว กลับมาเร็วๆนี้')??'';
    until=prompt('วันที่กลับมา (YYYY-MM-DD) กด OK เว้นว่างถ้าไม่แน่ใจ','')||'';
  }
  try{
    await api.setHolidayMode(newMode,msg||null,until||null);
    if(state.user)state.user.holiday_mode=newMode?1:0;
    localStorage.setItem('user',JSON.stringify(state.user));
    toast(newMode?'เปิด Holiday Mode แล้ว 🏖️':'ปิด Holiday Mode แล้ว ✅','#1D9E75');
    openProfile();
  }catch(e){toast(e.message);}
}

// ===== CHAT QUICK REPLY =====
function fillQuickReply(text){
  const input=document.getElementById('msgInput');
  if(input){input.value=text;input.focus();}
}

// ===== PWA INSTALL PROMPT =====
let _pwaPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();
  if(localStorage.getItem('pwaDismissed'))return;
  _pwaPrompt=e;
  const banner=document.getElementById('pwaInstallBanner');
  if(banner)banner.style.display='flex';
});
document.getElementById('pwaInstallBtn')?.addEventListener('click',async()=>{
  if(!_pwaPrompt)return;
  _pwaPrompt.prompt();
  const{outcome}=await _pwaPrompt.userChoice;
  _pwaPrompt=null;
  document.getElementById('pwaInstallBanner').style.display='none';
  if(outcome==='accepted')toast('ติดตั้งแอปสำเร็จ! 🎉','#1D9E75');
});
document.getElementById('pwaDismissBtn')?.addEventListener('click',()=>{
  document.getElementById('pwaInstallBanner').style.display='none';
  localStorage.setItem('pwaDismissed','1');
});

// ===== SWIPE TO BROWSE =====
let _swipeProducts=[],_swipeIndex=0;
async function openSwipeMode(){
  goPage('swipe');
  await startSwipeMode();
}
async function startSwipeMode(){
  const stack=document.getElementById('swipeStack');
  const done=document.getElementById('swipeDone');
  const actions=document.getElementById('swipeActions');
  if(stack)stack.innerHTML='<div style="text-align:center;padding:60px 20px;color:var(--text-sec)">กำลังโหลด...</div>';
  if(done)done.classList.add('hidden');
  if(actions)actions.style.display='flex';
  try{
    const products=await api.getProducts({limit:30});
    _swipeProducts=products.sort(()=>Math.random()-.5);
    _swipeIndex=0;
    renderSwipeCard();
  }catch(e){toast('โหลดสินค้าไม่สำเร็จ');}
}
function renderSwipeCard(){
  const stack=document.getElementById('swipeStack');
  const done=document.getElementById('swipeDone');
  const counter=document.getElementById('swipeCounter');
  const actions=document.getElementById('swipeActions');
  if(!stack)return;
  if(_swipeIndex>=_swipeProducts.length){
    stack.innerHTML='';
    if(done)done.classList.remove('hidden');
    if(counter)counter.textContent='';
    if(actions)actions.style.display='none';
    return;
  }
  if(counter)counter.textContent=`${_swipeIndex+1} / ${_swipeProducts.length}`;
  const p=_swipeProducts[_swipeIndex];
  const thumb=p.image_url
    ?`<img src="${imgSrc(p.image_url)}" alt="${p.title}" loading="lazy" style="width:100%;height:100%;object-fit:cover;pointer-events:none"/>`
    :`<span style="font-size:72px">${EMOJIS[p.category]||'📦'}</span>`;
  stack.innerHTML=`<div class="swipe-card" id="swipeCard">
    <div class="swipe-card-img">${thumb}</div>
    <div class="swipe-card-body">
      <div class="swipe-card-title">${p.title}</div>
      <div class="swipe-card-price">฿${Number(p.price).toLocaleString()}</div>
      <div class="swipe-card-meta">${p.condition||''} · ${p.location||''} · ${p.seller_name||''}</div>
    </div>
    <div class="swipe-indicator like" id="swipeIndLike">❤️ ถูกใจ</div>
    <div class="swipe-indicator skip" id="swipeIndSkip">✕ ข้าม</div>
  </div>`;
  const card=document.getElementById('swipeCard');
  card.addEventListener('click',()=>openDetail(p.id));
  initSwipeDrag(card);
}
function swipeLike(){
  const p=_swipeProducts[_swipeIndex];
  if(p&&state.user){
    api.toggleWishlist(p.id).then(()=>{
      if(!state.wlIds.includes(p.id)){state.wlIds.push(p.id);state.wlCount++;updateBadge('wlBadge',state.wlCount);}
      toast('เพิ่มในรายการโปรดแล้ว ❤️','#1D9E75');
    }).catch(()=>{});
  }else if(p&&!state.user){toast('กรุณาเข้าสู่ระบบเพื่อบันทึก');}
  _swipeIndex++;
  renderSwipeCard();
}
function swipeSkip(){_swipeIndex++;renderSwipeCard();}
function initSwipeDrag(card){
  if(!card)return;
  let startX=0,dx=0,dragging=false,animating=false;
  function setIndicators(d){
    const like=document.getElementById('swipeIndLike');
    const skip=document.getElementById('swipeIndSkip');
    if(!like||!skip)return;
    if(d>30){like.style.opacity=Math.min(1,(d-30)/60);skip.style.opacity=0;}
    else if(d<-30){skip.style.opacity=Math.min(1,(-d-30)/60);like.style.opacity=0;}
    else{like.style.opacity=0;skip.style.opacity=0;}
  }
  function onStart(x){if(animating)return;startX=x;dragging=true;card.classList.add('dragging');}
  function onMove(x){
    if(!dragging||animating)return;
    dx=x-startX;
    card.style.transform=`translateX(${dx}px) rotate(${dx*0.1}deg)`;
    setIndicators(dx);
  }
  function onEnd(){
    if(!dragging)return;dragging=false;card.classList.remove('dragging');
    if(Math.abs(dx)>90){
      animating=true;
      const dir=dx>0?1:-1;
      card.style.transition='transform .35s ease';
      card.style.transform=`translateX(${dir*600}px) rotate(${dir*30}deg)`;
      setTimeout(()=>{animating=false;dx>0?swipeLike():swipeSkip();},350);
    }else{
      card.style.transition='transform .3s ease';
      card.style.transform='';
      setTimeout(()=>{card.style.transition='';},300);
      setIndicators(0);dx=0;
    }
  }
  card.addEventListener('mousedown',e=>{onStart(e.clientX);e.preventDefault();});
  window.addEventListener('mousemove',e=>{if(dragging)onMove(e.clientX);});
  window.addEventListener('mouseup',()=>{if(dragging)onEnd();});
  let touchMoved=false;
  card.addEventListener('touchstart',e=>{touchMoved=false;onStart(e.touches[0].clientX);},{passive:true});
  card.addEventListener('touchmove',e=>{touchMoved=true;onMove(e.touches[0].clientX);},{passive:true});
  card.addEventListener('touchend',e=>{onEnd();if(touchMoved)e.stopPropagation();},{passive:true});
  card.addEventListener('click',e=>{if(Math.abs(dx)>10||animating)e.stopImmediatePropagation();});
}

// ===== SWIPE TO DISMISS MODALS =====
(function(){
  let startY=0;
  document.addEventListener('touchstart',e=>{if(e.target.closest('.modal'))startY=e.touches[0].clientY;},{ passive:true });
  document.addEventListener('touchend',e=>{
    if(!e.target.closest('.modal'))return;
    const diff=e.changedTouches[0].clientY-startY;
    if(diff>80){const ov=e.target.closest('.overlay');if(ov)ov.classList.remove('open');}
  },{ passive:true });
})();

// ============ ROUND 4: Community Board ============
let _communityCategory = 'ทั้งหมด';

function setCommunityCategory(cat, el) {
  _communityCategory = cat;
  document.querySelectorAll('#communityCats .chip').forEach(c => c.classList.remove('on'));
  if (el) el.classList.add('on');
  loadCommunity();
}

async function loadCommunity() {
  const list = document.getElementById('communityList');
  if (!list) return;
  list.innerHTML = '<div class="loading">กำลังโหลด...</div>';
  try {
    const posts = await api.getPosts(_communityCategory);
    if (!posts.length) { list.innerHTML = '<div class="empty-state"><span class="empty-state-icon">📋</span><h3>ยังไม่มีโพสต์</h3><p>เป็นคนแรกที่โพสต์ในหมวดนี้!</p></div>'; return; }
    list.innerHTML = posts.map(p => `
      <div class="community-card" onclick="openPost(${p.id})">
        <div style="font-size:11px;color:var(--text-hint);margin-bottom:6px;display:flex;align-items:center;gap:6px">
          <span class="community-cat-badge">${p.category}</span>
          <span>โดย ${p.author_name}</span>
          <span style="margin-left:auto">${new Date(p.created_at).toLocaleDateString('th',{month:'short',day:'numeric'})}</span>
        </div>
        <div style="display:flex;align-items:flex-start;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:15px;line-height:1.35;margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${p.title}</div>
            <div style="display:flex;align-items:center;gap:4px">
              <button class="rc-btn" onclick="event.stopPropagation();openPost(${p.id})">▲ ${p.like_count} ถูกใจ</button>
              <button class="rc-btn" onclick="event.stopPropagation();openPost(${p.id})">💬 ${p.comment_count} ความคิดเห็น</button>
            </div>
          </div>
          ${p.image_url ? `<img src="${p.image_url}" style="width:80px;height:64px;border-radius:6px;object-fit:cover;flex-shrink:0;margin-top:2px"/>` : ''}
        </div>
      </div>`).join('');
  } catch(e) { toast(e.message); }
}

function openNewPost() {
  if (!state.user) { openOverlay('loginOverlay'); return; }
  document.getElementById('postTitle').value = '';
  document.getElementById('postContent').value = '';
  document.getElementById('postImage').value = '';
  openOverlay('newPostOverlay');
}

async function doCreatePost() {
  const title = document.getElementById('postTitle').value.trim();
  const content = document.getElementById('postContent').value.trim();
  const category = document.getElementById('postCategory').value;
  const imageFile = document.getElementById('postImage').files[0];
  if (!title || !content) { toast('กรุณากรอกหัวข้อและเนื้อหา'); return; }
  try {
    const fd = new FormData();
    fd.append('title', title); fd.append('content', content); fd.append('category', category);
    if (imageFile) fd.append('image', imageFile);
    await api.createPost(fd);
    closeOverlay('newPostOverlay');
    toast('โพสต์แล้ว ✅', '#1D9E75');
    loadCommunity();
  } catch(e) { toast(e.message); }
}

async function openPost(id) {
  const c = document.getElementById('postDetailContent');
  c.innerHTML = '<div class="loading">กำลังโหลด...</div>';
  openOverlay('postDetailOverlay');
  try {
    const p = await api.getPost(id);
    const canDelete = state.user && (state.user.id === p.user_id || state.user.is_admin);
    c.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <div class="story-avatar">${(p.author_name||'?').slice(0,2).toUpperCase()}</div>
        <div style="flex:1">
          <div style="font-weight:600">${p.author_name}</div>
          <div style="font-size:11px;color:var(--text-hint)">${new Date(p.created_at).toLocaleDateString('th',{year:'numeric',month:'long',day:'numeric'})}</div>
        </div>
        <span class="community-cat-badge">${p.category}</span>
        ${canDelete ? `<button class="btn btn-sm btn-danger" onclick="doDeletePost(${p.id})">🗑️</button>` : ''}
      </div>
      ${p.image_url ? `<img src="${p.image_url}" style="width:100%;border-radius:10px;margin-bottom:12px;object-fit:cover"/>` : ''}
      <h3 style="font-size:17px;font-weight:700;margin-bottom:8px">${p.title}</h3>
      <p style="font-size:14px;color:var(--text-sec);white-space:pre-wrap;margin-bottom:16px">${p.content}</p>
      <button class="btn btn-sm" onclick="doLikePost(${p.id},this)" style="margin-bottom:16px">❤️ ${p.like_count} ถูกใจ</button>
      <div style="font-weight:600;margin-bottom:10px">💬 ความคิดเห็น (${p.comments.length})</div>
      <div id="postComments">${p.comments.map(cm => `
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <div class="story-avatar" style="width:32px;height:32px;font-size:12px">${(cm.author_name||'?').slice(0,2).toUpperCase()}</div>
          <div style="flex:1;background:var(--bg-sec);border-radius:10px;padding:8px 12px">
            <div style="font-weight:600;font-size:12px">${cm.author_name}</div>
            <div style="font-size:13px">${cm.content}</div>
          </div>
        </div>`).join('')}
      </div>
      ${state.user ? `
        <div style="display:flex;gap:8px;margin-top:12px">
          <input type="text" id="commentInput" class="input" placeholder="แสดงความคิดเห็น..." style="flex:1"/>
          <button class="btn btn-g btn-sm" onclick="doComment(${p.id})">ส่ง</button>
        </div>` : '<p style="color:var(--text-sec);font-size:13px;margin-top:12px">เข้าสู่ระบบเพื่อแสดงความคิดเห็น</p>'}`;
  } catch(e) { toast(e.message); }
}

async function doLikePost(id, btn) {
  if (!state.user) { openOverlay('loginOverlay'); return; }
  try {
    const res = await api.likePost(id);
    toast(res.liked ? '❤️ ถูกใจแล้ว' : 'เอาถูกใจออกแล้ว');
    openPost(id);
  } catch(e) { toast(e.message); }
}

async function doComment(postId) {
  const input = document.getElementById('commentInput');
  const content = input.value.trim();
  if (!content) return;
  try {
    await api.commentPost(postId, content);
    input.value = '';
    openPost(postId);
  } catch(e) { toast(e.message); }
}

async function doDeletePost(id) {
  if (!confirm('ลบโพสต์นี้?')) return;
  try {
    await api.deletePost(id);
    closeOverlay('postDetailOverlay');
    toast('ลบโพสต์แล้ว');
    loadCommunity();
  } catch(e) { toast(e.message); }
}

// ============ ROUND 4: Story Feed ============
// ── Story System (redesigned) ──────────────────────────────
let _storyGroups = {}, _storyQueue = [], _storyIdx = 0, _storyTimer = null;

async function loadStories() {
  try {
    const stories = await api.getStories();
    const strip = document.getElementById('storyStrip');
    const list = document.getElementById('storyList');
    if (!strip || !list) return;
    if (!stories.length) { strip.style.display = 'none'; return; }
    strip.style.display = 'flex';

    // group by user
    _storyGroups = {};
    stories.forEach(s => {
      if (!_storyGroups[s.user_id]) _storyGroups[s.user_id] = { ...s, stories: [] };
      _storyGroups[s.user_id].stories.push(s);
    });

    list.innerHTML = Object.values(_storyGroups).map(g => `
      <div class="story-item" onclick="viewStoryGroup(${g.user_id})">
        <div class="story-ring">
          ${g.author_avatar ? `<img src="${imgSrc(g.author_avatar)}" class="story-thumb"/>` : `<div class="story-thumb story-text-thumb">${(g.author_name||'?').slice(0,2).toUpperCase()}</div>`}
        </div>
        <div class="story-name">${(g.author_name||'').split(' ')[0]}</div>
      </div>`).join('');
  } catch(e) {}
}

function viewStoryGroup(userId) {
  const group = _storyGroups[userId];
  if (!group) return;
  _storyQueue = group.stories;
  _storyIdx = 0;
  openOverlay('storyOverlay');
  _renderStory();
}

function _renderStory() {
  if (_storyTimer) { clearTimeout(_storyTimer); _storyTimer = null; }
  const s = _storyQueue[_storyIdx];
  if (!s) { closeStoryViewer(); return; }
  const total = _storyQueue.length;
  const timeLeft = Math.max(0, Math.floor((new Date(s.expires_at) - Date.now()) / 3600000));
  const canDelete = state.user && state.user.id === s.user_id;

  const bars = Array.from({length: total}, (_, i) => `
    <div class="story-progress-bar">
      <div class="story-progress-fill" id="spb-${i}" style="width:${i < _storyIdx ? '100%' : '0%'}"></div>
    </div>`).join('');

  document.getElementById('storyViewerContent').innerHTML = `
    <div class="story-progress-track">${bars}</div>
    <div class="story-user-row">
      <div class="story-avatar" style="width:36px;height:36px;font-size:12px">${(s.author_name||'?').slice(0,2).toUpperCase()}</div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:13px;color:#fff">${s.author_name}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.6)">เหลืออีก ${timeLeft} ชม.</div>
      </div>
      ${canDelete ? `<button onclick="doDeleteStory(${s.id})" style="background:rgba(255,255,255,.15);border:none;color:#fff;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px">🗑️ ลบ</button>` : ''}
    </div>
    <div class="story-media-area" onclick="storyTapNav(event)">
      ${s.image_url ? `<img src="${s.image_url}" style="width:100%;max-height:62vh;border-radius:14px;object-fit:contain;display:block"/>` : `<div style="height:160px"></div>`}
      ${s.caption ? `<p style="color:#fff;margin-top:14px;font-size:17px;text-align:center;font-weight:500;text-shadow:0 1px 4px rgba(0,0,0,.6)">${s.caption}</p>` : ''}
    </div>
    <div style="display:flex;justify-content:space-between;padding:12px 4px 0;opacity:.4;font-size:12px;color:#fff">
      <span>${_storyIdx > 0 ? '◀ ก่อนหน้า' : ''}</span>
      <span>${_storyIdx < total-1 ? 'ถัดไป ▶' : '✕ ปิด'}</span>
    </div>`;

  // animate progress bar
  requestAnimationFrame(() => {
    const fill = document.getElementById(`spb-${_storyIdx}`);
    if (fill) { fill.style.transition = 'width 5s linear'; fill.style.width = '100%'; }
  });
  _storyTimer = setTimeout(() => storyNext(), 5000);
}

function storyTapNav(e) {
  const r = e.currentTarget.getBoundingClientRect();
  if ((e.clientX - r.left) < r.width / 2) storyPrev(); else storyNext();
}
function storyNext() {
  if (_storyTimer) { clearTimeout(_storyTimer); _storyTimer = null; }
  if (_storyIdx < _storyQueue.length - 1) { _storyIdx++; _renderStory(); }
  else closeStoryViewer();
}
function storyPrev() {
  if (_storyTimer) { clearTimeout(_storyTimer); _storyTimer = null; }
  if (_storyIdx > 0) { _storyIdx--; _renderStory(); }
}
function closeStoryViewer() {
  if (_storyTimer) { clearTimeout(_storyTimer); _storyTimer = null; }
  closeOverlay('storyOverlay');
}

// stories on seller profile
function renderSellerStories(sellerId) {
  const group = _storyGroups[sellerId];
  if (!group || !group.stories.length) return '';
  return `<div style="margin:12px 0 4px;font-weight:600;font-size:14px;color:var(--text-sec)">📖 Story ล่าสุด</div>
    <div class="seller-story-strip">
      ${group.stories.map((s,i) => `
        <div style="flex-shrink:0;cursor:pointer" onclick="viewStoryGroup(${sellerId});_storyIdx=${i};_renderStory()">
          <div class="story-ring" style="width:54px;height:54px">
            ${s.image_url ? `<img src="${s.image_url}" class="story-thumb" style="width:50px;height:50px"/>` : `<div class="story-thumb story-text-thumb" style="width:50px;height:50px;font-size:14px">${i+1}</div>`}
          </div>
          <div class="story-name">${s.caption ? s.caption.slice(0,8)+'…' : `Story ${i+1}`}</div>
        </div>`).join('')}
    </div>`;
}

function openAddStory() {
  if (!state.user) { openOverlay('loginOverlay'); return; }
  document.getElementById('storyImageInput').value = '';
  document.getElementById('storyCaption').value = '';
  openOverlay('addStoryOverlay');
}

async function doAddStory() {
  const file = document.getElementById('storyImageInput').files[0];
  const caption = document.getElementById('storyCaption').value.trim();
  if (!file && !caption) { toast('ต้องมีรูปหรือข้อความ'); return; }
  try {
    const fd = new FormData();
    if (file) fd.append('image', file);
    fd.append('caption', caption);
    await api.addStory(fd);
    closeOverlay('addStoryOverlay');
    toast('เพิ่ม Story แล้ว ✅', '#1D9E75');
    loadStories();
  } catch(e) { toast(e.message); }
}

async function doDeleteStory(id) {
  if (!confirm('ลบ story นี้?')) return;
  try {
    await api.deleteStory(id);
    closeOverlay('storyOverlay');
    toast('ลบ story แล้ว');
    loadStories();
  } catch(e) { toast(e.message); }
}

// ============ ROUND 4: Bulk CSV Upload ============
function openCSVUpload() {
  document.getElementById('csvFileInput').value = '';
  document.getElementById('csvPreview').innerHTML = '';
  openOverlay('csvOverlay');
}

function downloadCSVTemplate() {
  const header = 'title,price,category,condition,description,location';
  const example = 'iPhone 14 สีดำ,15000,มือถือ,สภาพดี,ใช้งาน 6 เดือน แบตดี,กรุงเทพฯ';
  const blob = new Blob([header+'\n'+example], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'ploikhong-template.csv'; a.click();
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,''));
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g,''));
    const obj = {};
    headers.forEach((h,i) => obj[h] = vals[i]||'');
    return obj;
  }).filter(r => r.title && r.price);
}

document.addEventListener('change', e => {
  if (e.target.id !== 'csvFileInput') return;
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const products = parseCSV(ev.target.result);
    const preview = document.getElementById('csvPreview');
    if (!products.length) { preview.innerHTML = '<span style="color:#dc2626">ไม่พบข้อมูล — ตรวจสอบรูปแบบ CSV</span>'; return; }
    preview.innerHTML = `<b style="color:#16a34a">พบ ${products.length} รายการ</b><br/>${products.slice(0,3).map(p=>`• ${p.title} — ฿${p.price}`).join('<br/>')}${products.length>3?`<br/>...และอีก ${products.length-3} รายการ`:''}`;
    window._csvProducts = products;
  };
  reader.readAsText(file, 'UTF-8');
});

async function doUploadCSV() {
  const products = window._csvProducts;
  if (!products || !products.length) { toast('กรุณาเลือกไฟล์ CSV ก่อน'); return; }
  try {
    const res = await api.bulkCSV(products);
    closeOverlay('csvOverlay');
    toast(`เพิ่มสินค้าแล้ว ${res.inserted} รายการ ✅`, '#1D9E75');
    loadProducts();
    window._csvProducts = null;
  } catch(e) { toast(e.message); }
}

// ============ ROUND 4: Map Meetup (Google Maps) ============
let _meetupMap = null, _meetupMarker = null, _meetupLatLng = null, _meetupSource = null;
const _meetupData = { s: null, e: null };

function toggleMeetupBtn(src) {
  const sel = document.getElementById(src === 's' ? 'sDel' : 'eDel');
  const row = document.getElementById(src === 's' ? 'sMeetupRow' : 'eMeetupRow');
  if (!sel || !row) return;
  row.style.display = sel.value !== 'shipping' ? 'block' : 'none';
}

function _initGMap(container, lat, lng, draggable, onPick) {
  const map = new google.maps.Map(container, {
    center: { lat, lng },
    zoom: 15,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  });
  const marker = new google.maps.Marker({
    position: { lat, lng },
    map,
    draggable,
    animation: google.maps.Animation.DROP,
  });
  if (draggable && onPick) {
    marker.addListener('dragend', e => onPick(e.latLng.lat(), e.latLng.lng(), marker));
    map.addListener('click', e => {
      marker.setPosition(e.latLng);
      onPick(e.latLng.lat(), e.latLng.lng(), marker);
    });
  }
  return { map, marker };
}

async function _reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=AIzaSyDdJGqjObnrJtqIoK-9TUjYdIwIMo77MvY&language=th`);
    const data = await res.json();
    if (data.results && data.results[0]) return data.results[0].formatted_address;
  } catch {}
  return null;
}

function openMeetupMap(src = 's') {
  _meetupSource = src;
  const prev = _meetupData[src];
  const lat = prev?.lat || 13.7563, lng = prev?.lng || 100.5018;
  openOverlay('mapOverlay');
  document.getElementById('meetupNote').value = prev?.note || '';
  document.getElementById('meetupNote').readOnly = false;
  document.getElementById('meetupSearch').value = '';
  const confirmBtn = document.querySelector('#mapOverlay .btn-g');
  if (confirmBtn) confirmBtn.style.display = '';
  setTimeout(() => {
    const container = document.getElementById('meetupMap');
    if (!container || !window.google) return;
    container.innerHTML = '';
    _meetupLatLng = { lat, lng };
    const onPick = (la, lo) => { _meetupLatLng = { lat: la, lng: lo }; };
    const { map, marker } = _initGMap(container, lat, lng, true, onPick);
    _meetupMap = map; _meetupMarker = marker;

    // Places Autocomplete (ถ้า Places API enable อยู่เท่านั้น)
    const searchInput = document.getElementById('meetupSearch');
    if (google.maps.places?.Autocomplete) {
      const ac = new google.maps.places.Autocomplete(searchInput, {
        componentRestrictions: { country: 'th' },
        fields: ['geometry', 'name', 'formatted_address'],
      });
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (!place.geometry) return;
        const loc = place.geometry.location;
        map.panTo(loc); map.setZoom(16);
        marker.setPosition(loc);
        _meetupLatLng = { lat: loc.lat(), lng: loc.lng() };
      });
    }
  }, 300);
}

function meetupSearchGo() {
  const q = document.getElementById('meetupSearch').value.trim();
  if (!q || !window.google) return;
  const geocoder = new google.maps.Geocoder();
  geocoder.geocode({ address: q, region: 'th', language: 'th' }, (results, status) => {
    if (status !== 'OK' || !results[0]) { toast('ไม่พบสถานที่ กรุณาลองใหม่'); return; }
    const loc = results[0].geometry.location;
    _meetupLatLng = { lat: loc.lat(), lng: loc.lng() };
    if (_meetupMap && _meetupMarker) {
      _meetupMap.panTo(loc); _meetupMap.setZoom(16);
      _meetupMarker.setPosition(loc);
      _meetupMarker.setAnimation(google.maps.Animation.DROP);
      setTimeout(() => _meetupMarker.setAnimation(null), 1000);
    }
  });
}

function meetupCurrentLocation() {
  if (!navigator.geolocation) { toast('เบราว์เซอร์ไม่รองรับ GPS'); return; }
  toast('กำลังหาตำแหน่ง...⏳');
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    _meetupLatLng = { lat, lng };
    if (_meetupMap && _meetupMarker) {
      const loc = new google.maps.LatLng(lat, lng);
      _meetupMap.panTo(loc); _meetupMap.setZoom(17);
      _meetupMarker.setPosition(loc);
      _meetupMarker.setAnimation(google.maps.Animation.BOUNCE);
      setTimeout(() => _meetupMarker.setAnimation(null), 1400);
    }
  }, () => toast('ไม่สามารถเข้าถึงตำแหน่งได้'));
}

async function confirmMeetupLocation() {
  if (!_meetupLatLng) { toast('กรุณาเลือกจุดบนแผนที่'); return; }
  const note = document.getElementById('meetupNote').value.trim();
  const src = _meetupSource || 's';
  _meetupData[src] = { lat: _meetupLatLng.lat, lng: _meetupLatLng.lng, note };
  closeOverlay('mapOverlay');
  // แสดง address จาก Geocoding API
  const info = document.getElementById(src + 'MeetupInfo');
  if (info) {
    info.style.display = 'block';
    info.textContent = '📍 กำลังโหลดที่อยู่...';
    const addr = await _reverseGeocode(_meetupLatLng.lat, _meetupLatLng.lng);
    info.textContent = `📍 ${addr || `${_meetupLatLng.lat.toFixed(5)}, ${_meetupLatLng.lng.toFixed(5)}`}${note ? ' · ' + note : ''}`;
  }
  toast('📍 บันทึกจุดนัดรับแล้ว', '#1D9E75');
}

function openProductMap(lat, lng, note) {
  openOverlay('mapOverlay');
  document.getElementById('meetupNote').value = note || '';
  document.getElementById('meetupNote').readOnly = true;
  const confirmBtn = document.querySelector('#mapOverlay .btn-g');
  if (confirmBtn) confirmBtn.style.display = 'none';
  setTimeout(() => {
    const container = document.getElementById('meetupMap');
    if (!container || !window.google) return;
    container.innerHTML = '';
    const { map, marker } = _initGMap(container, Number(lat), Number(lng), false);
    if (note) {
      const infoWindow = new google.maps.InfoWindow({ content: `<div style="font-size:13px;padding:4px">${note}</div>` });
      infoWindow.open(map, marker);
    }
  }, 300);
}
