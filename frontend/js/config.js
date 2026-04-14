// ตั้งค่า URL ของ backend server
// เมื่อ deploy จริงให้เปลี่ยนเป็น URL ของ backend คุณ
// เช่น 'https://your-backend.railway.app' หรือ 'https://your-backend.render.com'
const CONFIG = {
  API_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://your-backend-url-here.com'  // <-- เปลี่ยนตรงนี้เมื่อ deploy
};
