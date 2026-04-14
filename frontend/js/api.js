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
      const data = await res.json();
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
  getChatRooms() { return this.get('/api/chat/rooms'); },
  openChatRoom(seller_id,product_id) { return this.post('/api/chat/room',{seller_id,product_id}); },
  getMessages(roomId) { return this.get('/api/chat/rooms/'+roomId+'/messages'); },
  getReviews(pid) { return this.get('/api/reviews/product/'+pid); },
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
};
