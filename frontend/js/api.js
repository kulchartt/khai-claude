const api = {
  async req(method, path, body = null, formData = false) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (!formData) headers['Content-Type'] = 'application/json';
    const opts = { method, headers };
    if (body) opts.body = formData ? body : JSON.stringify(body);
    try {
      const res = await fetch(CONFIG.API_URL + path, opts);
      let data;
      try { data = await res.json(); }
      catch { throw new Error(`Server error ${res.status} — กรุณาลองใหม่อีกครั้ง`); }
      if (res.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        document.getElementById('loginOverlay')?.classList.add('open');
        throw new Error(data.error || 'กรุณาเข้าสู่ระบบใหม่');
      }
      if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
      return data;
    } catch (e) { throw e; }
  },
  get(p) { return this.req('GET', p); },
  post(p, b, fd) { return this.req('POST', p, b, fd); },
  put(p, b) { return this.req('PUT', p, b); },
  patch(p, b) { return this.req('PATCH', p, b); },
  delete(p) { return this.req('DELETE', p); },
  getProducts(params={}) {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v])=>v!==''&&v!=null)));
    return this.get('/api/products?'+q);
  },
  getProduct(id) { return this.get('/api/products/'+id); },
  createProduct(fd) { return this.req('POST','/api/products',fd,true); },
  updateProduct(id, data) { return this.put('/api/products/'+id, data); },
  deleteProduct(id) { return this.delete('/api/products/'+id); },
  login(e,p) { return this.post('/api/auth/login',{email:e,password:p}); },
  register(n,e,p) { return this.post('/api/auth/register',{name:n,email:e,password:p}); },
  getMe() { return this.get('/api/auth/me'); },
  getCart() { return this.get('/api/cart'); },
  addCart(id) { return this.post('/api/cart/add',{product_id:id}); },
  updateCartQty(id,qty) { return this.post('/api/cart/qty',{product_id:id,qty}); },
  removeCart(id) { return this.delete('/api/cart/'+id); },
  checkout() { return this.post('/api/cart/checkout',{}); },
  getWishlist() { return this.get('/api/wishlist'); },
  toggleWishlist(id) { return this.post('/api/wishlist/toggle',{product_id:id}); },
  getMyProducts() {
    const me = JSON.parse(localStorage.getItem('user')||'null');
    return me ? this.get('/api/users/'+me.id+'/products') : Promise.resolve([]);
  },
  getSeller(id) { return this.get('/api/users/'+id); },
  getSellerProducts(id) { return this.get('/api/users/'+id+'/products'); },
  getOrders() { return this.get('/api/users/me/orders'); },
  uploadAvatar(fd) { return this.req('PATCH','/api/users/me/avatar',fd,true); },
  getChatRooms() { return this.get('/api/chat/rooms'); },
  openChatRoom(seller_id,product_id) { return this.post('/api/chat/room',{seller_id,product_id}); },
  getMessages(roomId) { return this.get('/api/chat/rooms/'+roomId+'/messages'); },
  getReviews(pid) { return this.get('/api/reviews/product/'+pid); },
  getSellerReviews(sid) { return this.get('/api/reviews/seller/'+sid); },
  submitReview(pid,rating,comment) { return this.post('/api/reviews',{product_id:pid,rating,comment}); },
  getNotifications() { return this.get('/api/notifications'); },
  readAllNotifications() { return this.post('/api/notifications/read-all',{}); },
  deleteNotification(id) { return this.delete('/api/notifications/'+id); },
  adminStats() { return this.get('/api/admin/stats'); },
  adminUsers(q) { return this.get('/api/admin/users'+(q?'?q='+q:'')); },
  adminBanUser(id) { return this.patch('/api/admin/users/'+id+'/ban',{}); },
  adminProducts(params) {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params||{}).filter(([,v])=>v)));
    return this.get('/api/admin/products?'+q);
  },
  adminDeleteProduct(id) { return this.delete('/api/admin/products/'+id); },
  adminUpdateProductStatus(id,status) { return this.patch('/api/admin/products/'+id+'/status',{status}); },
  report(productId, reason, detail) { return this.post('/api/reports',{product_id:productId,reason,detail}); },
  bumpProduct(id) { return this.post('/api/products/'+id+'/bump', {}); },
  closeSale(id) { return this.patch('/api/products/'+id+'/close', {}); },
  makeOffer(productId, offerPrice, message) { return this.post('/api/offers',{product_id:productId,offer_price:offerPrice,message}); },
  getIncomingOffers() { return this.get('/api/offers/incoming'); },
  getOutgoingOffers() { return this.get('/api/offers/outgoing'); },
  respondOffer(id, status) { return this.patch('/api/offers/'+id,{status}); },
  getAnalytics() { return this.get('/api/users/me/analytics'); },
  getChatUnread() { return this.get('/api/chat/unread'); },
  markOrderReceived(id) { return this.patch('/api/users/me/orders/'+id+'/received', {}); },
  getPromptpay() { return this.get('/api/users/me/promptpay'); },
  savePromptpay(promptpay) { return this.patch('/api/users/me/promptpay', { promptpay }); },
  getSellerOrders() { return this.get('/api/users/me/seller-orders'); },
  submitSlip(orderId, fd) { return this.req('POST', '/api/orders/'+orderId+'/slip', fd, true); },
  confirmPayment(orderId) { return this.patch('/api/orders/'+orderId+'/confirm-payment', {}); },
  cancelOrder(orderId) { return this.patch('/api/orders/'+orderId+'/cancel', {}); },
  shipOrder(orderId, shipping_status, tracking_number, tracking_carrier) { return this.patch('/api/orders/'+orderId+'/ship', { shipping_status, tracking_number, tracking_carrier }); },
  sellerCancelOrder(orderId) { return this.patch('/api/orders/'+orderId+'/seller-cancel', {}); },
  sendChatImage(roomId, fd) { return this.req('POST', '/api/chat/rooms/'+roomId+'/image', fd, true); },
  toggleFollow(sellerId) { return this.post('/api/follows/toggle', { seller_id: sellerId }); },
  getFollows() { return this.get('/api/follows'); },
  getFollowerCount(sellerId) { return this.get('/api/follows/count/'+sellerId); },
  getFollowStatus(sellerId) { return this.get('/api/follows/status/'+sellerId); },
  getShop(userId) { return this.get('/api/shop/'+userId); },
  updateShop(data) { return this.patch('/api/shop/me', data); },
  uploadShopBanner(fd) { return this.req('PATCH','/api/shop/me/banner',fd,true); },
  getAddresses() { return this.get('/api/addresses'); },
  createAddress(data) { return this.post('/api/addresses', data); },
  updateAddress(id, data) { return this.patch('/api/addresses/'+id, data); },
  setDefaultAddress(id) { return this.patch('/api/addresses/'+id+'/default', {}); },
  deleteAddress(id) { return this.delete('/api/addresses/'+id); },
  postBuyerReview(orderId, rating, comment) { return this.post('/api/buyer-reviews', {order_id:orderId, rating, comment}); },
  getBuyerReviews(userId) { return this.get('/api/buyer-reviews/user/'+userId); },
  getSavedSearches() { return this.get('/api/saved-searches'); },
  createSavedSearch(keyword, category, max_price) { return this.post('/api/saved-searches', {keyword, category, max_price}); },
  deleteSavedSearch(id) { return this.delete('/api/saved-searches/'+id); },
  openDispute(formData) { return this.req('POST','/api/disputes',formData,true); },
  getMyDisputes() { return this.get('/api/disputes/me'); },
  getMyPromos() { return this.get('/api/promo/my'); },
  createPromo(data) { return this.post('/api/promo', data); },
  togglePromo(id) { return this.patch('/api/promo/'+id+'/toggle', {}); },
  deletePromo(id) { return this.delete('/api/promo/'+id); },
  checkPromo(code, seller_id, total) { return this.post('/api/promo/check', {code, seller_id, total}); },
  saveBank(data) { return this.patch('/api/users/me/bank', data); },
  getTransactions() { return this.get('/api/users/me/transactions'); },
  getTrending() { return this.get('/api/products/trending'); },
  adminVerifySeller(id) { return this.patch('/api/admin/users/'+id+'/verify', {}); },
  adminToggleAdmin(id) { return this.patch('/api/admin/users/'+id+'/toggle-admin', {}); },
  adminGetDisputes() { return this.get('/api/admin/disputes'); },
  adminUpdateDispute(id, status, admin_note) { return this.patch('/api/admin/disputes/'+id, {status, admin_note}); },
  submitVerifyRequest(reason) { return this.post('/api/users/me/verify-request', { reason }); },
  getMyVerifyRequest() { return this.get('/api/users/me/verify-request'); },
  adminGetVerifyRequests() { return this.get('/api/admin/verify-requests'); },
  adminHandleVerifyRequest(id, action, admin_note) { return this.patch('/api/admin/verify-requests/'+id, {action, admin_note}); },
  submitFeedback(category, message, sender_name, sender_email) { return this.post('/api/feedback', {category, message, sender_name, sender_email}); },
  adminGetFeedback() { return this.get('/api/feedback/admin'); },
  adminUpdateFeedback(id, data) { return this.patch('/api/feedback/admin/'+id, data); },
  getMyReports() { return this.get('/api/reports/me'); },
  adminGetReports() { return this.get('/api/reports'); },
  adminUpdateReport(id, status) { return this.patch('/api/reports/'+id+'/status', {status}); },
  setFlashSale(id, flash_price, duration_hours) { return this.post('/api/products/'+id+'/flash', {flash_price, duration_hours}); },
  cancelFlashSale(id) { return this.delete('/api/products/'+id+'/flash'); },
  reserveProduct(id) { return this.post('/api/products/'+id+'/reserve', {}); },
  respondReservation(id, action) { return this.patch('/api/products/'+id+'/reserve', {action}); },
  getMyReservations() { return this.get('/api/products/my/reservations'); },
  getBundles() { return this.get('/api/bundles'); },
  getBundleDetail(id) { return this.get('/api/bundles/'+id); },
  getSellerBundles(id) { return this.get('/api/bundles/seller/'+id); },
  createBundle(data) { return this.post('/api/bundles', data); },
  deleteBundle(id) { return this.delete('/api/bundles/'+id); },
  setHolidayMode(holiday_mode, holiday_message, holiday_until) { return this.patch('/api/shop/me', {holiday_mode, holiday_message, holiday_until}); },
  getPoints() { return this.get('/api/users/me/points'); },
  deleteProductImage(productId, imageId) { return this.delete('/api/products/'+productId+'/images/'+imageId); },
  reorderProductImages(productId, ids) { return this.patch('/api/products/'+productId+'/images/reorder', {ids}); },
  getPosts(category) {
    const q = category && category !== 'ทั้งหมด' ? '?category='+encodeURIComponent(category) : '';
    return this.get('/api/community/posts'+q);
  },
  getPost(id) { return this.get('/api/community/posts/'+id); },
  createPost(fd) { return this.req('POST','/api/community/posts',fd,true); },
  deletePost(id) { return this.delete('/api/community/posts/'+id); },
  commentPost(id, content) { return this.post('/api/community/posts/'+id+'/comment', {content}); },
  likePost(id) { return this.post('/api/community/posts/'+id+'/like', {}); },
  getStories() { return this.get('/api/stories'); },
  addStory(fd) { return this.req('POST','/api/stories',fd,true); },
  deleteStory(id) { return this.delete('/api/stories/'+id); },
  bulkCSV(products) { return this.post('/api/products/bulk-csv', {products}); },
  aiDescription(title, category, condition, existing) { return this.post('/api/ai/description', {title, category, condition, existing}); },
  aiPriceSuggest(category, condition) { return this.get('/api/ai/price-suggest?category='+encodeURIComponent(category)+'&condition='+encodeURIComponent(condition||'')); },
  sendChatVoice(roomId, fd) { return this.req('POST', '/api/chat/rooms/'+roomId+'/voice', fd, true); },
  imageSearch(fd) { return this.req('POST','/api/ai/image-search',fd,true); },
  submitEkyc(fd) { return this.req('POST','/api/ekyc',fd,true); },
  getEkycStatus() { return this.get('/api/ekyc/status'); },
};
