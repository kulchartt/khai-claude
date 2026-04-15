const EMOJIS={มือถือ:'📱',เสื้อผ้า:'👗',หนังสือ:'📚',กีฬา:'⚽',ของแต่งบ้าน:'🏠',กล้อง:'📷'};
const CMAP={'มือสองใหม่':'cond-new','สภาพดี':'cond-good','สภาพพอใช้':'cond-fair'};
const NICONS={chat:'💬',review:'⭐',order:'📦',system:'📢'};

let state={user:JSON.parse(localStorage.getItem('user')||'null'),token:localStorage.getItem('token')||null,cat:'ทั้งหมด',cartCount:0,wlCount:0,notifCount:0,chatCount:0,wlIds:[],starRating:0};
let socket=null,currentRoomId=null;

function toast(msg,color){const t=document.getElementById('toast');t.textContent=msg;t.style.background=color||'#1a1a18';t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2800);}
function goPage(p){document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));document.getElementById('page-'+p).classList.add('active');window.scrollTo(0,0);}
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

function productImg(p){const url=p.image_url;if(url)return `<img src="${CONFIG.API_URL}${url}" alt="${p.title}" onerror="this.parentNode.innerHTML='<span class=\\'emoji\\'>${EMOJIS[p.category||p.cat]||'📦'}</span>'"/>`;return `<span class="emoji">${EMOJIS[p.category||p.cat]||'📦'}</span>`;}
function renderCards(list,cid){const g=document.getElementById(cid);if(!g)return;if(!list.length){g.innerHTML='<div class="empty-msg">ไม่พบสินค้า</div>';return;}g.innerHTML=list.map(p=>`<div class="card" onclick="openDetail(${p.id})"><div class="card-img">${productImg(p)}</div><div class="card-body"><div class="card-title">${p.title}</div><div class="card-price">฿${Number(p.price).toLocaleString()}</div><div class="card-foot"><span class="cond ${CMAP[p.condition||p.cond]||''}">${p.condition||p.cond}</span><span class="seller-nm">${p.seller_name||p.location||''}</span></div></div></div>`).join('');}

async function loadProducts(){
  const q=document.getElementById('searchQ').value,minPrice=document.getElementById('minP').value,maxPrice=document.getElementById('maxP').value,sort=document.getElementById('sortSel').value,condition=document.getElementById('condSel').value;
  document.getElementById('productGrid').innerHTML=Array(8).fill('<div class="skeleton-card"><div class="skeleton skeleton-img"></div><div class="skeleton-body"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></div></div>').join('');
  try{const params={};if(state.cat!=='ทั้งหมด')params.cat=state.cat;if(q)params.q=q;if(minPrice)params.minPrice=minPrice;if(maxPrice)params.maxPrice=maxPrice;if(sort)params.sort=sort;if(condition)params.condition=condition;const products=await api.getProducts(params);document.getElementById('statCount').textContent=products.length+'+';renderCards(products,'productGrid');}
  catch(e){document.getElementById('productGrid').innerHTML='<div class="empty-msg">โหลดไม่สำเร็จ</div>';}
}
function applyFilter(){loadProducts();}
function setCat(cat,el){state.cat=cat;document.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));el.classList.add('on');loadProducts();}

async function openDetail(id){
  try{
    const[p,rv]=await Promise.all([api.getProduct(id),api.getReviews(id)]);
    const inWl=state.wlIds.includes(id),isOwner=state.user&&state.user.id===p.seller_id;
    window.location.hash='product-'+id;
    document.getElementById('detailContent').innerHTML=`
      <div class="detail-hero">
        <div>${buildGallery(p)}</div>
        <div class="detail-info">
          <h1 class="detail-title">${p.title}</h1>
          <div class="detail-price">฿${Number(p.price).toLocaleString()}</div>
          <div class="detail-actions">
            ${!isOwner?`<button class="btn btn-g" onclick="addToCart(${p.id})">🛒 ใส่ตะกร้า</button>`:''}
            ${!isOwner?`<button class="btn" onclick="startChat(${p.seller_id},${p.id})">💬 แชทผู้ขาย</button>`:''}
            <button class="btn wl-btn ${inWl?'liked':''}" id="wlBtn_${p.id}" onclick="toggleWl(${p.id})">${inWl?'❤️':'🤍'}</button>
            ${!isOwner?`<button class="btn" onclick="openReviewModal(${p.id})">⭐ รีวิว</button>`:''}
            ${isOwner?`<button class="btn" onclick="openEditModal(${p.id})">✏️ แก้ไข</button><button class="btn btn-danger" onclick="confirmDeleteProduct(${p.id})">🗑️ ลบสินค้า</button>`:''}
            <button class="share-btn" onclick="shareProduct(${p.id},'${p.title.replace(/'/g,"\\'")}')">🔗 แชร์</button>
            ${!isOwner?`<button class="report-btn" onclick="openReportModal(${p.id})">🚩 แจ้ง</button>`:''}
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
        <h3>รายละเอียดสินค้า</h3><p>${p.description||'ไม่มีรายละเอียดเพิ่มเติม'}</p>
        <h3>ผู้ขาย</h3>
        <div class="seller-card" onclick="openSellerProfile(${p.seller_id})" style="cursor:pointer">
          <div class="s-avatar" style="overflow:hidden">${p.seller_avatar?`<img src="${CONFIG.API_URL}${p.seller_avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`:(p.seller_name||'?').slice(0,2).toUpperCase()}</div>
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

function shareProduct(id,title){
  const url=location.origin+location.pathname+'#product-'+id;
  if(navigator.share){navigator.share({title,url}).catch(()=>{});}
  else{navigator.clipboard.writeText(url).then(()=>toast('คัดลอกลิงก์แล้ว! 🔗','#1D9E75')).catch(()=>toast('คัดลอกไม่สำเร็จ'));}
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
  try{const items=await api.getCart();const c=document.getElementById('cartContent');if(!items.length){c.innerHTML='<div class="empty-msg">ตะกร้าว่างเปล่า<br><br><button class="btn btn-g" onclick="goPage(\'home\')">ดูสินค้า</button></div>';goPage('cart');return;}const total=items.reduce((s,x)=>s+x.price*x.qty,0);c.innerHTML=items.map(x=>`<div class="cart-item"><div class="cart-thumb">${x.image_url?`<img src="${CONFIG.API_URL}${x.image_url}"/>`:(EMOJIS[x.category]||'📦')}</div><div class="cart-info"><div class="cart-name">${x.title}</div><div class="cart-price">฿${Number(x.price).toLocaleString()} × ${x.qty}</div></div><div class="cart-qty"><button class="btn btn-sm" onclick="changeQty(${x.product_id},${x.qty-1})">-</button><span>${x.qty}</span><button class="btn btn-sm" onclick="changeQty(${x.product_id},${x.qty+1})">+</button><button class="btn btn-sm btn-danger" onclick="removeCartItem(${x.product_id})">✕</button></div></div>`).join('')+`<div class="cart-summary"><div class="summary-row"><span>${items.length} รายการ</span><span>฿${total.toLocaleString()}</span></div><div class="summary-row"><span>ค่าจัดส่ง</span><span>ฟรี</span></div><div class="summary-total"><span>รวมทั้งหมด</span><span>฿${total.toLocaleString()}</span></div><button class="btn btn-g full" style="margin-top:16px" onclick="doCheckout()">ยืนยันชำระเงิน</button></div>`;goPage('cart');}catch(e){toast(e.message);}
}
async function changeQty(pid,qty){try{await api.updateCartQty(pid,qty);if(qty<=0)state.cartCount=Math.max(0,state.cartCount-1);updateBadge('cartBadge',state.cartCount);openCart();}catch(e){toast(e.message);}}
async function removeCartItem(pid){try{await api.removeCart(pid);state.cartCount=Math.max(0,state.cartCount-1);updateBadge('cartBadge',state.cartCount);openCart();}catch(e){toast(e.message);}}
async function doCheckout(){try{await api.checkout();state.cartCount=0;updateBadge('cartBadge',0);goPage('home');toast('ชำระเงินสำเร็จ! 🎉','#1D9E75');}catch(e){toast(e.message);}}

async function openProfile(){if(!state.user){openOverlay('loginOverlay');return;}try{const[me,myItems]=await Promise.all([api.getMe(),api.getMyProducts()]);const avatarHtml=me.avatar?`<img src="${CONFIG.API_URL}${me.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`:`${me.name.slice(0,2).toUpperCase()}`;document.getElementById('profileContent').innerHTML=`<div class="profile-header"><div style="display:flex;flex-direction:column;align-items:center;gap:4px"><div class="p-avatar" onclick="document.getElementById('avatarInput').click()" style="cursor:pointer;overflow:hidden">${avatarHtml}</div><div style="font-size:11px;color:var(--text-hint)">กดเพื่อเปลี่ยน</div><input type="file" id="avatarInput" accept="image/*" style="display:none" onchange="doUploadAvatar(this)"/></div><div style="flex:1"><div class="p-name">${me.name}</div><div class="p-email">${me.email}</div><div class="p-stats"><div class="stat"><div class="stat-n" style="font-size:20px">${myItems.length}</div><div class="stat-l">สินค้าลงขาย</div></div><div class="stat"><div class="stat-n" style="font-size:20px">${state.wlCount}</div><div class="stat-l">รายการโปรด</div></div><div class="stat"><div class="stat-n" style="font-size:20px">${me.rating||5.0}★</div><div class="stat-l">คะแนน</div></div></div></div></div><div class="profile-tabs"><div class="profile-tab on" id="ptab-products" onclick="profileTab('products')">สินค้าของฉัน (${myItems.length})</div><div class="profile-tab" id="ptab-orders" onclick="profileTab('orders')">ประวัติซื้อ</div></div><div id="profileTabContent"></div><div style="margin-top:24px;padding:0 4px"><button class="btn btn-danger full" onclick="doLogout()">ออกจากระบบ</button></div>`;window._myItems=myItems;profileTab('products');goPage('profile');}catch(e){toast(e.message);}}

function profileTab(tab){document.querySelectorAll('.profile-tab').forEach(t=>t.classList.toggle('on',t.id==='ptab-'+tab));const c=document.getElementById('profileTabContent');if(tab==='products'){c.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0 12px"><span style="font-weight:600">สินค้าของฉัน</span><button class="btn btn-sm btn-g" onclick="openSell()">+ ลงขายเพิ่ม</button></div><div class="product-grid" id="myProductsGrid"></div>`;renderMyCards(window._myItems||[],'myProductsGrid');}else{c.innerHTML='<div class="loading">กำลังโหลด...</div>';api.getOrders().then(orders=>{if(!orders.length){c.innerHTML='<div class="empty-msg">ยังไม่มีประวัติการสั่งซื้อ</div>';return;}c.innerHTML='<div style="margin-top:16px">'+orders.map(o=>`<div class="order-item"><div class="order-top"><div><div class="order-id">คำสั่งซื้อ #${String(o.id).padStart(4,'0')}</div><div class="order-date">${new Date(o.created_at).toLocaleDateString('th',{year:'numeric',month:'long',day:'numeric'})}</div></div><div class="order-total">฿${Number(o.total).toLocaleString()}</div></div><div class="order-items-list">${o.items}</div><div class="order-status ${o.status==='pending'?'status-pending':'status-done'}">${o.status==='pending'?'รอดำเนินการ':'สำเร็จ'}</div></div>`).join('')+'</div>';}).catch(e=>toast(e.message));}}

async function doUploadAvatar(input){if(!input.files[0])return;const fd=new FormData();fd.append('avatar',input.files[0]);try{const res=await api.uploadAvatar(fd);toast('อัปเดตรูปโปรไฟล์แล้ว ✅','#1D9E75');openProfile();}catch(e){toast(e.message);}}

async function openSellerProfile(userId){try{const[seller,products]=await Promise.all([api.getSeller(userId),api.getSellerProducts(userId)]);document.getElementById('sellerBackBtn').onclick=()=>history.back();const avatarHtml=seller.avatar?`<img src="${CONFIG.API_URL}${seller.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`:`${(seller.name||'?').slice(0,2).toUpperCase()}`;document.getElementById('sellerContent').innerHTML=`<div class="profile-header"><div class="p-avatar" style="overflow:hidden">${avatarHtml}</div><div style="flex:1"><div class="p-name">${seller.name}</div><div class="p-email">สมาชิกตั้งแต่ ${new Date(seller.created_at).toLocaleDateString('th',{year:'numeric',month:'long'})}</div><div class="p-stats"><div class="stat"><div class="stat-n" style="font-size:20px">${products.length}</div><div class="stat-l">สินค้า</div></div><div class="stat"><div class="stat-n" style="font-size:20px">${seller.rating||5.0}★</div><div class="stat-l">คะแนน</div></div><div class="stat"><div class="stat-n" style="font-size:20px">${seller.review_count||0}</div><div class="stat-l">รีวิว</div></div></div></div></div><div class="section-title" style="margin-top:20px"><span>สินค้าทั้งหมด (${products.length})</span></div><div class="product-grid" id="sellerProductGrid"></div>`;renderCards(products,'sellerProductGrid');goPage('seller');}catch(e){toast(e.message);}}

function renderMyCards(list,cid){const g=document.getElementById(cid);if(!g)return;if(!list.length){g.innerHTML='<div class="empty-msg">ยังไม่มีสินค้า<br><br><button class="btn btn-g" onclick="openSell()">+ ลงขายเลย</button></div>';return;}g.innerHTML=list.map(p=>`<div class="card"><div class="card-img" onclick="openDetail(${p.id})">${productImg(p)}</div><div class="card-body" onclick="openDetail(${p.id})"><div class="card-title">${p.title}</div><div class="card-price">฿${Number(p.price).toLocaleString()}</div><div class="card-foot"><span class="cond ${CMAP[p.condition||p.cond]||''}">${p.condition||p.cond}</span><span class="seller-nm" style="color:${p.status==='sold'?'#dc2626':'var(--green)'}">${p.status==='sold'?'ขายแล้ว':'วางขาย'}</span></div></div><div class="card-actions"><button class="btn btn-sm" onclick="openEditModal(${p.id})">✏️ แก้ไข</button><button class="btn btn-sm btn-danger" onclick="confirmDeleteProduct(${p.id})">🗑️ ลบ</button></div></div>`).join('');}

async function openEditModal(id){try{const p=await api.getProduct(id);document.getElementById('eId').value=p.id;document.getElementById('eTitle').value=p.title;document.getElementById('ePrice').value=p.price;document.getElementById('eDesc').value=p.description||'';document.getElementById('eLoc').value=p.location||'';document.getElementById('eCat').value=p.category;document.getElementById('eCond').value=p.condition;document.getElementById('eStatus').value=p.status||'available';openOverlay('editOverlay');}catch(e){toast(e.message);}}

async function doEditProduct(){const id=document.getElementById('eId').value,title=document.getElementById('eTitle').value.trim(),price=document.getElementById('ePrice').value;if(!title||!price){toast('กรุณากรอกชื่อสินค้าและราคา');return;}try{await api.updateProduct(id,{title,price:Number(price),category:document.getElementById('eCat').value,condition:document.getElementById('eCond').value,description:document.getElementById('eDesc').value,location:document.getElementById('eLoc').value,status:document.getElementById('eStatus').value});closeOverlay('editOverlay');toast('อัปเดตสินค้าแล้ว ✅','#1D9E75');openProfile();}catch(e){toast(e.message);}}

async function confirmDeleteProduct(id){if(!confirm('ลบสินค้านี้? จะไม่สามารถกู้คืนได้'))return;try{await api.deleteProduct(id);toast('ลบสินค้าแล้ว');openProfile();}catch(e){toast(e.message);}}

function switchTab(t){document.getElementById('loginForm').classList.toggle('hidden',t!=='login');document.getElementById('regForm').classList.toggle('hidden',t!=='reg');document.getElementById('tabLogin').classList.toggle('on',t==='login');document.getElementById('tabReg').classList.toggle('on',t==='reg');}
async function doLogin(){const email=document.getElementById('loginEmail').value.trim(),pass=document.getElementById('loginPass').value;if(!email||!pass){toast('กรุณากรอกข้อมูลให้ครบ');return;}try{const res=await api.login(email,pass);localStorage.setItem('token',res.token);localStorage.setItem('user',JSON.stringify(res.user));state.user=res.user;state.token=res.token;closeOverlay('loginOverlay');updateNav();toast('ยินดีต้อนรับ '+res.user.name+'!','#1D9E75');await syncBadges();connectSocket();}catch(e){toast(e.message);}}
async function doRegister(){const name=document.getElementById('regName').value.trim(),email=document.getElementById('regEmail').value.trim(),pass=document.getElementById('regPass').value;if(!name||!email||!pass){toast('กรุณากรอกข้อมูลให้ครบ');return;}try{const res=await api.register(name,email,pass);localStorage.setItem('token',res.token);localStorage.setItem('user',JSON.stringify(res.user));state.user=res.user;state.token=res.token;closeOverlay('loginOverlay');updateNav();toast('สมัครสำเร็จ! ยินดีต้อนรับ 🎉','#1D9E75');connectSocket();}catch(e){toast(e.message);}}
function doLogout(){if(socket){socket.disconnect();socket=null;}localStorage.removeItem('token');localStorage.removeItem('user');state.user=null;state.token=null;state.cartCount=0;state.wlCount=0;state.notifCount=0;state.chatCount=0;state.wlIds=[];['cartBadge','wlBadge','notifBadge','chatBadge'].forEach(id=>updateBadge(id,0));updateNav();goPage('home');toast('ออกจากระบบแล้ว');}
function openSell(){if(!state.user){toast('กรุณาเข้าสู่ระบบก่อน');openOverlay('loginOverlay');return;}openOverlay('sellOverlay');}
async function doSell(){const title=document.getElementById('sTitle').value.trim(),price=document.getElementById('sPrice').value;if(!title||!price){toast('กรุณากรอกชื่อสินค้าและราคา');return;}const fd=new FormData();fd.append('title',title);fd.append('price',price);fd.append('category',document.getElementById('sCat').value);fd.append('condition',document.getElementById('sCond').value);fd.append('description',document.getElementById('sDesc').value);fd.append('location',document.getElementById('sLoc').value);const imgs=document.getElementById('sImg').files;for(const img of imgs)fd.append('images',img);try{await api.createProduct(fd);closeOverlay('sellOverlay');['sTitle','sPrice','sDesc','sLoc'].forEach(i=>document.getElementById(i).value='');document.getElementById('sImg').value='';document.getElementById('imgPreviewGrid').innerHTML='';toast('ลงขายสินค้าสำเร็จ! 🎉','#1D9E75');loadProducts();}catch(e){toast(e.message);}}

function openReviewModal(pid){if(!state.user){openOverlay('loginOverlay');return;}document.getElementById('reviewProductId').value=pid;document.getElementById('reviewComment').value='';state.starRating=0;setStar(0);openOverlay('reviewOverlay');}
function setStar(n){state.starRating=n;document.querySelectorAll('.star').forEach((s,i)=>s.classList.toggle('on',i<n));}
async function doReview(){const pid=document.getElementById('reviewProductId').value,comment=document.getElementById('reviewComment').value;if(!state.starRating){toast('กรุณาให้คะแนนก่อน');return;}try{await api.submitReview(pid,state.starRating,comment);closeOverlay('reviewOverlay');toast('ส่งรีวิวแล้ว! ⭐','#1D9E75');openDetail(pid);}catch(e){toast(e.message);}}

async function startChat(sellerId,productId){if(!state.user){openOverlay('loginOverlay');return;}try{const room=await api.openChatRoom(sellerId,productId);await openChatList();openRoom(room.id);}catch(e){toast(e.message);}}
async function openChatList(){if(!state.user){openOverlay('loginOverlay');return;}try{const rooms=await api.getChatRooms();const list=document.getElementById('chatRoomsList');if(!rooms.length){list.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-sec);font-size:13px">ยังไม่มีการสนทนา</div>';goPage('chat');return;}list.innerHTML=rooms.map(r=>{const other=r.buyer_id===state.user.id?r.seller_name:r.buyer_name;return `<div class="chat-room-item ${r.unread>0?'unread':''}" onclick="openRoom(${r.id})"><div style="display:flex;justify-content:space-between"><div class="cr-name">${other}</div><div class="cr-time">${r.last_at?new Date(r.last_at).toLocaleTimeString('th',{hour:'2-digit',minute:'2-digit'}):''}</div></div><div class="cr-last">${r.product_title?'['+r.product_title+'] ':''} ${r.last_message||'เริ่มการสนทนา'}</div></div>`;}).join('');goPage('chat');}catch(e){toast(e.message);}}
async function openRoom(roomId){currentRoomId=roomId;try{const msgs=await api.getMessages(roomId);document.getElementById('chatMain').innerHTML=`<div class="chat-header">การสนทนา</div><div class="chat-messages" id="msgList">${msgs.map(m=>{const out=m.sender_id===state.user.id;return `<div>${!out?`<div class="msg-name">${m.sender_name}</div>`:''}<div class="msg ${out?'msg-out':'msg-in'}">${m.content}<div class="msg-time">${new Date(m.created_at).toLocaleTimeString('th',{hour:'2-digit',minute:'2-digit'})}</div></div></div>`;}).join('')}</div><div class="chat-input"><input type="text" id="msgInput" placeholder="พิมพ์ข้อความ..." onkeydown="if(event.key==='Enter')sendMsg()"/><button onclick="sendMsg()">ส่ง</button></div>`;const ml=document.getElementById('msgList');if(ml)ml.scrollTop=ml.scrollHeight;if(socket)socket.emit('join_room',roomId);state.chatCount=Math.max(0,state.chatCount-1);updateBadge('chatBadge',state.chatCount);}catch(e){toast(e.message);}}
function sendMsg(){const input=document.getElementById('msgInput');if(!input||!input.value.trim()||!socket)return;socket.emit('send_message',{room_id:currentRoomId,content:input.value.trim()});input.value='';}

async function openNotifications(){if(!state.user){openOverlay('loginOverlay');return;}try{const res=await api.getNotifications();const list=document.getElementById('notifList');if(!res.notifications.length){list.innerHTML='<div class="empty-msg">ไม่มีการแจ้งเตือน</div>';goPage('notifications');return;}list.innerHTML=res.notifications.map(n=>`<div class="notif-item ${n.is_read?'':'unread'}" onclick="clickNotif(${n.id},'${n.link}')"><div class="notif-icon">${NICONS[n.type]||'📢'}</div><div style="flex:1"><div class="notif-title">${n.title}</div><div class="notif-body">${n.body}</div><div class="notif-time">${new Date(n.created_at).toLocaleString('th')}</div></div><button onclick="event.stopPropagation();delNotif(${n.id})" style="background:none;border:none;color:var(--text-hint);cursor:pointer;font-size:16px">×</button></div>`).join('');state.notifCount=0;updateBadge('notifBadge',0);goPage('notifications');}catch(e){toast(e.message);}}
async function readAllNotifs(){try{await api.readAllNotifications();state.notifCount=0;updateBadge('notifBadge',0);openNotifications();}catch(e){toast(e.message);}}
async function delNotif(id){try{await api.deleteNotification(id);openNotifications();}catch(e){toast(e.message);}}
function clickNotif(id,link){if(link&&link.includes('chat'))openChatList();}

async function openAdmin(){if(!state.user?.is_admin){toast('ไม่มีสิทธิ์เข้าถึง');return;}try{const stats=await api.adminStats();document.getElementById('adminContent').innerHTML=`<h2 style="font-size:20px;font-weight:700;margin-bottom:20px">🛡️ Admin Panel</h2><div class="stat-cards"><div class="stat-card"><div class="stat-card-n">${stats.users}</div><div class="stat-card-l">ผู้ใช้ทั้งหมด</div></div><div class="stat-card"><div class="stat-card-n">${stats.products}</div><div class="stat-card-l">สินค้าทั้งหมด</div></div><div class="stat-card"><div class="stat-card-n">${stats.available}</div><div class="stat-card-l">วางขายอยู่</div></div><div class="stat-card"><div class="stat-card-n">${stats.sold}</div><div class="stat-card-l">ขายแล้ว</div></div><div class="stat-card"><div class="stat-card-n">${stats.orders}</div><div class="stat-card-l">คำสั่งซื้อ</div></div><div class="stat-card"><div class="stat-card-n">฿${Number(stats.revenue).toLocaleString()}</div><div class="stat-card-l">ยอดขายรวม</div></div></div><div class="admin-tabs"><div class="admin-tab on" id="atab-users" onclick="adminTab('users')">ผู้ใช้งาน</div><div class="admin-tab" id="atab-products" onclick="adminTab('products')">สินค้า</div></div><div id="adminTabContent"></div>`;goPage('admin');adminTab('users');}catch(e){toast(e.message);}}
async function adminTab(tab){document.querySelectorAll('.admin-tab').forEach(t=>t.classList.toggle('on',t.id==='atab-'+tab));const c=document.getElementById('adminTabContent');if(tab==='users'){const users=await api.adminUsers();c.innerHTML=`<div style="margin-bottom:12px"><input id="adminUserQ" type="text" placeholder="ค้นหาผู้ใช้..." style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-sec);color:var(--text);font-size:14px;width:260px" oninput="adminSearchUsers()"/></div><div style="overflow-x:auto"><table class="data-table" id="usersTable"><thead><tr><th>ID</th><th>ชื่อ</th><th>อีเมล</th><th>คะแนน</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${users.map(u=>`<tr><td>${u.id}</td><td>${u.name}</td><td>${u.email}</td><td>${u.rating}★</td><td><span style="font-size:12px;padding:3px 8px;border-radius:99px;background:${u.is_banned?'#fef2f2':'#f0fdf4'};color:${u.is_banned?'#dc2626':'#16a34a'}">${u.is_admin?'Admin':u.is_banned?'ถูกแบน':'ปกติ'}</span></td><td>${!u.is_admin?`<button class="btn btn-sm ${u.is_banned?'btn-g':'btn-danger'}" onclick="adminBan(${u.id})">${u.is_banned?'ปลดแบน':'แบน'}</button>`:'-'}</td></tr>`).join('')}</tbody></table></div>`;}else{const products=await api.adminProducts({});c.innerHTML=`<div style="margin-bottom:12px;display:flex;gap:8px"><input id="adminProdQ" type="text" placeholder="ค้นหาสินค้า..." style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-sec);color:var(--text);font-size:14px;width:220px" oninput="adminSearchProducts()"/><select id="adminProdStatus" onchange="adminSearchProducts()" style="padding:8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-sec);color:var(--text);font-size:13px"><option value="">สถานะทั้งหมด</option><option value="available">วางขาย</option><option value="sold">ขายแล้ว</option></select></div><div style="overflow-x:auto"><table class="data-table" id="productsTable"><thead><tr><th>ID</th><th>ชื่อสินค้า</th><th>ราคา</th><th>ผู้ขาย</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${products.map(p=>`<tr><td>${p.id}</td><td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.title}</td><td>฿${Number(p.price).toLocaleString()}</td><td>${p.seller_name}</td><td><span style="font-size:12px;padding:3px 8px;border-radius:99px;background:${p.status==='available'?'#f0fdf4':'#f9fafb'};color:${p.status==='available'?'#16a34a':'#6b7280'}">${p.status==='available'?'วางขาย':'ขายแล้ว'}</span></td><td style="display:flex;gap:4px"><button class="btn btn-sm" onclick="adminToggleProduct(${p.id},'${p.status==='available'?'sold':'available'}')">${p.status==='available'?'ปิด':'เปิด'}</button><button class="btn btn-sm btn-danger" onclick="adminDelProduct(${p.id})">ลบ</button></td></tr>`).join('')}</tbody></table></div>`;}}
async function adminSearchUsers(){const q=document.getElementById('adminUserQ')?.value;const users=await api.adminUsers(q);document.querySelector('#usersTable tbody').innerHTML=users.map(u=>`<tr><td>${u.id}</td><td>${u.name}</td><td>${u.email}</td><td>${u.rating}★</td><td><span style="font-size:12px;padding:3px 8px;border-radius:99px;background:${u.is_banned?'#fef2f2':'#f0fdf4'};color:${u.is_banned?'#dc2626':'#16a34a'}">${u.is_admin?'Admin':u.is_banned?'ถูกแบน':'ปกติ'}</span></td><td>${!u.is_admin?`<button class="btn btn-sm ${u.is_banned?'btn-g':'btn-danger'}" onclick="adminBan(${u.id})">${u.is_banned?'ปลดแบน':'แบน'}</button>`:'-'}</td></tr>`).join('');}
async function adminSearchProducts(){const q=document.getElementById('adminProdQ')?.value,status=document.getElementById('adminProdStatus')?.value;const products=await api.adminProducts({q,status});document.querySelector('#productsTable tbody').innerHTML=products.map(p=>`<tr><td>${p.id}</td><td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.title}</td><td>฿${Number(p.price).toLocaleString()}</td><td>${p.seller_name}</td><td><span style="font-size:12px;padding:3px 8px;border-radius:99px;background:${p.status==='available'?'#f0fdf4':'#f9fafb'};color:${p.status==='available'?'#16a34a':'#6b7280'}">${p.status==='available'?'วางขาย':'ขายแล้ว'}</span></td><td style="display:flex;gap:4px"><button class="btn btn-sm" onclick="adminToggleProduct(${p.id},'${p.status==='available'?'sold':'available'}')">${p.status==='available'?'ปิด':'เปิด'}</button><button class="btn btn-sm btn-danger" onclick="adminDelProduct(${p.id})">ลบ</button></td></tr>`).join('');}
async function adminBan(id){try{const r=await api.adminBanUser(id);toast(r.message);adminTab('users');}catch(e){toast(e.message);}}
async function adminDelProduct(id){if(!confirm('ลบสินค้านี้?'))return;try{await api.adminDeleteProduct(id);toast('ลบแล้ว');adminTab('products');}catch(e){toast(e.message);}}
async function adminToggleProduct(id,status){try{await api.adminUpdateProductStatus(id,status);adminTab('products');}catch(e){toast(e.message);}}

function connectSocket(){if(!state.token||socket)return;socket=window.io(CONFIG.API_URL,{auth:{token:state.token}});socket.on('new_message',msg=>{if(msg.room_id!==currentRoomId)return;const ml=document.getElementById('msgList');if(!ml)return;const out=msg.sender_id===state.user.id;const div=document.createElement('div');div.innerHTML=`${!out?`<div class="msg-name">${msg.sender_name}</div>`:''}<div class="msg ${out?'msg-out':'msg-in'}">${msg.content}<div class="msg-time">${new Date(msg.created_at).toLocaleTimeString('th',{hour:'2-digit',minute:'2-digit'})}</div></div>`;ml.appendChild(div);ml.scrollTop=ml.scrollHeight;});socket.on('notification',()=>{state.notifCount++;updateBadge('notifBadge',state.notifCount);state.chatCount++;updateBadge('chatBadge',state.chatCount);});}

async function syncBadges(){if(!state.user)return;try{const[cart,wl,notifs]=await Promise.all([api.getCart(),api.getWishlist(),api.getNotifications()]);state.cartCount=cart.reduce((s,x)=>s+x.qty,0);state.wlCount=wl.length;state.wlIds=wl.map(x=>x.product_id);state.notifCount=notifs.unread;updateBadge('cartBadge',state.cartCount);updateBadge('wlBadge',state.wlCount);updateBadge('notifBadge',state.notifCount);}catch{}}

async function init(){
  updateNav();
  await loadProducts();
  if(state.user){await syncBadges();connectSocket();}
  // Deep link: open product from URL hash
  const hash=window.location.hash;
  if(hash.startsWith('#product-')){
    const id=parseInt(hash.replace('#product-',''));
    if(!isNaN(id))openDetail(id);
  }
  // Listen for back/forward navigation
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

function previewImages(input) {
  const grid = document.getElementById('imgPreviewGrid');
  const wrap = document.getElementById('imgUploadWrap');
  grid.innerHTML = '';
  if (!input.files.length) return;
  Array.from(input.files).forEach((file, i) => {
    const reader = new FileReader();
    reader.onload = e => {
      const div = document.createElement('div');
      div.className = 'img-preview-item' + (i === 0 ? ' main-img' : '');
      div.innerHTML = `<img src="${e.target.result}" alt="preview"/><button class="remove-img" onclick="removePreviewImg(${i})">×</button>`;
      grid.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
  wrap.querySelector('.img-upload-placeholder').innerHTML = `📷 เลือกแล้ว ${input.files.length} รูป <span style="font-size:12px;color:var(--green)">กดเพื่อเพิ่ม</span>`;
}

function removePreviewImg(index) {
  const input = document.getElementById('sImg');
  const dt = new DataTransfer();
  Array.from(input.files).forEach((f, i) => { if (i !== index) dt.items.add(f); });
  input.files = dt.files;
  previewImages(input);
}

function buildGallery(product) {
  const images = product.images && product.images.length > 0 ? product.images : (product.image_url ? [{url: product.image_url}] : []);
  if (!images.length) return `<div class="detail-main-img"><span class="emoji">${EMOJIS[product.category]||'📦'}</span></div>`;
  return `
    <div class="detail-gallery">
      <div class="detail-main-img" id="mainImgWrap">
        <img src="${CONFIG.API_URL}${images[0].url}" id="mainImg" alt="${product.title}"/>
      </div>
      ${images.length > 1 ? `<div class="detail-thumbs">${images.map((img, i) => `
        <div class="detail-thumb ${i===0?'active':''}" onclick="switchImg('${CONFIG.API_URL}${img.url}', this)">
          <img src="${CONFIG.API_URL}${img.url}" alt="thumb"/>
        </div>`).join('')}</div>` : ''}
    </div>`;
}

function switchImg(url, el) {
  document.getElementById('mainImg').src = url;
  document.querySelectorAll('.detail-thumb').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}
