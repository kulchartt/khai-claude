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
      if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
      return data;
    } catch (e) {
      throw e;
    }
  },
  get(path) { return this.req('GET', path); },
  post(path, body, fd) { return this.req('POST', path, body, fd); },
  put(path, body) { return this.req('PUT', path, body); },
  delete(path) { return this.req('DELETE', path); },

  async getProducts(params = {}) {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v)));
    return this.get('/api/products?' + q);
  },
  async getProduct(id) { return this.get('/api/products/' + id); },
  async createProduct(formData) { return this.req('POST', '/api/products', formData, true); },
  async deleteProduct(id) { return this.delete('/api/products/' + id); },

  async login(email, password) { return this.post('/api/auth/login', { email, password }); },
  async register(name, email, password) { return this.post('/api/auth/register', { name, email, password }); },
  async getMe() { return this.get('/api/auth/me'); },

  async getCart() { return this.get('/api/cart'); },
  async addCart(product_id) { return this.post('/api/cart/add', { product_id }); },
  async updateCartQty(product_id, qty) { return this.post('/api/cart/qty', { product_id, qty }); },
  async removeCart(product_id) { return this.delete('/api/cart/' + product_id); },
  async checkout() { return this.post('/api/cart/checkout', {}); },

  async getWishlist() { return this.get('/api/wishlist'); },
  async toggleWishlist(product_id) { return this.post('/api/wishlist/toggle', { product_id }); },

  async getMyProducts() {
    const me = JSON.parse(localStorage.getItem('user') || 'null');
    if (!me) return [];
    return this.get('/api/users/' + me.id + '/products');
  },
};
