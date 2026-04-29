const express = require('express');
const multer  = require('multer');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { uploadDocument } = require('../cloudinary');
const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf';
    if (ok) cb(null, true);
    else cb(new Error('รองรับเฉพาะรูปภาพและ PDF เท่านั้น'));
  },
});

router.use(authMiddleware);

function adminOnly(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Admin only' });
  next();
}

// ─── GET /api/accounting/summary?month=4&year=2026 ────────────────────────────
// รายรับ (จาก payment_requests confirmed) + รายจ่าย + กำไร
router.get('/summary', adminOnly, async (req, res) => {
  try {
    const db = getDB();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();

    // รายรับ: ดึงจาก payment_requests ที่ confirmed แล้ว
    const { rows: incomeRows } = await db.query(`
      SELECT
        COALESCE(SUM(amount), 0) AS total,
        COUNT(*) AS count
      FROM payment_requests
      WHERE status = 'confirmed'
        AND EXTRACT(MONTH FROM created_at) = $1
        AND EXTRACT(YEAR  FROM created_at) = $2
    `, [month, year]);

    // รายจ่าย: จาก accounting_expenses
    const { rows: expenseRows } = await db.query(`
      SELECT
        COALESCE(SUM(amount), 0) AS total,
        COUNT(*) AS count
      FROM accounting_expenses
      WHERE EXTRACT(MONTH FROM expense_date) = $1
        AND EXTRACT(YEAR  FROM expense_date) = $2
    `, [month, year]);

    // รายรับรายวัน (สำหรับกราฟ)
    const { rows: incomeByDay } = await db.query(`
      SELECT
        DATE(created_at) AS day,
        SUM(amount) AS amount
      FROM payment_requests
      WHERE status = 'confirmed'
        AND EXTRACT(MONTH FROM created_at) = $1
        AND EXTRACT(YEAR  FROM created_at) = $2
      GROUP BY DATE(created_at)
      ORDER BY day
    `, [month, year]);

    // รายจ่ายตาม category
    const { rows: expenseByCategory } = await db.query(`
      SELECT
        category,
        SUM(amount) AS amount,
        COUNT(*) AS count
      FROM accounting_expenses
      WHERE EXTRACT(MONTH FROM expense_date) = $1
        AND EXTRACT(YEAR  FROM expense_date) = $2
      GROUP BY category
      ORDER BY amount DESC
    `, [month, year]);

    const totalIncome  = parseFloat(incomeRows[0].total)  || 0;
    const totalExpense = parseFloat(expenseRows[0].total) || 0;

    res.json({
      month, year,
      income:           totalIncome,
      income_count:     parseInt(incomeRows[0].count),
      expense:          totalExpense,
      expense_count:    parseInt(expenseRows[0].count),
      profit:           totalIncome - totalExpense,
      income_by_day:    incomeByDay,
      expense_by_cat:   expenseByCategory,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/accounting/income?month=&year= ─────────────────────────────────
// รายรับรายการ (payment_requests confirmed)
router.get('/income', adminOnly, async (req, res) => {
  try {
    const db = getDB();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();

    const { rows } = await db.query(`
      SELECT pr.id, pr.amount, pr.package_key, pr.coins, pr.sender_name,
             pr.slip_url, pr.created_at, u.name AS user_name, u.email AS user_email
      FROM payment_requests pr
      LEFT JOIN users u ON u.id = pr.user_id
      WHERE pr.status = 'confirmed'
        AND EXTRACT(MONTH FROM pr.created_at) = $1
        AND EXTRACT(YEAR  FROM pr.created_at) = $2
      ORDER BY pr.created_at DESC
    `, [month, year]);

    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/accounting/expenses?month=&year= ───────────────────────────────
router.get('/expenses', adminOnly, async (req, res) => {
  try {
    const db = getDB();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();

    const { rows } = await db.query(`
      SELECT ae.*, u.name AS created_by_name
      FROM accounting_expenses ae
      LEFT JOIN users u ON u.id = ae.created_by
      WHERE EXTRACT(MONTH FROM expense_date) = $1
        AND EXTRACT(YEAR  FROM expense_date) = $2
      ORDER BY expense_date DESC, ae.created_at DESC
    `, [month, year]);

    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /api/accounting/expenses ───────────────────────────────────────────
router.post('/expenses', adminOnly, (req, res, next) => {
  upload.single('receipt')(req, res, err => {
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const db = getDB();
    const { category, description, amount, expense_date } = req.body;
    if (!category || !description || amount === undefined || amount === null || amount === '') {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
    }
    if (parseFloat(amount) < 0) {
      return res.status(400).json({ error: 'จำนวนเงินต้องไม่ติดลบ' });
    }

    // อัปโหลดเอกสาร (ถ้ามี)
    let receipt_url = null;
    if (req.file) {
      const result = await uploadDocument(req.file.buffer, {
        public_id: `expense_${Date.now()}`,
        format: req.file.mimetype === 'application/pdf' ? 'pdf' : undefined,
      });
      receipt_url = result.secure_url;
    }

    const { rows } = await db.query(`
      INSERT INTO accounting_expenses (category, description, amount, expense_date, receipt_url, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      category,
      description,
      parseFloat(amount),
      expense_date || new Date().toISOString().split('T')[0],
      receipt_url,
      req.user.id,
    ]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PATCH /api/accounting/expenses/:id ──────────────────────────────────────
router.patch('/expenses/:id', adminOnly, (req, res, next) => {
  upload.single('receipt')(req, res, err => {
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const db = getDB();
    const { category, description, amount, expense_date } = req.body;

    // Build dynamic SET clause
    const fields = [];
    const values = [];
    let idx = 1;

    if (category)     { fields.push(`category = $${idx++}`);     values.push(category); }
    if (description)  { fields.push(`description = $${idx++}`);  values.push(description); }
    if (amount !== undefined && amount !== null && amount !== '') {
      if (parseFloat(amount) < 0) return res.status(400).json({ error: 'จำนวนเงินต้องไม่ติดลบ' });
      fields.push(`amount = $${idx++}`); values.push(parseFloat(amount));
    }
    if (expense_date) { fields.push(`expense_date = $${idx++}`); values.push(expense_date); }

    // อัปโหลดเอกสารใหม่ (ถ้ามี)
    if (req.file) {
      const result = await uploadDocument(req.file.buffer, {
        public_id: `expense_${Date.now()}`,
        format: req.file.mimetype === 'application/pdf' ? 'pdf' : undefined,
      });
      fields.push(`receipt_url = $${idx++}`);
      values.push(result.secure_url);
    }

    if (fields.length === 0) return res.status(400).json({ error: 'ไม่มีข้อมูลให้อัปเดต' });

    values.push(req.params.id);
    const { rows, rowCount } = await db.query(
      `UPDATE accounting_expenses SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (rowCount === 0) return res.status(404).json({ error: 'ไม่พบรายการ' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── DELETE /api/accounting/expenses/:id ─────────────────────────────────────
router.delete('/expenses/:id', adminOnly, async (req, res) => {
  try {
    const db = getDB();
    const { rowCount } = await db.query(
      'DELETE FROM accounting_expenses WHERE id = $1',
      [req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'ไม่พบรายการ' });
    res.json({ message: 'ลบแล้ว' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/accounting/yearly?year= ────────────────────────────────────────
// สรุปรายปี แยกทุกเดือน
router.get('/yearly', adminOnly, async (req, res) => {
  try {
    const db = getDB();
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const { rows: incomeByMonth } = await db.query(`
      SELECT
        EXTRACT(MONTH FROM created_at) AS month,
        SUM(amount) AS income
      FROM payment_requests
      WHERE status = 'confirmed' AND EXTRACT(YEAR FROM created_at) = $1
      GROUP BY month ORDER BY month
    `, [year]);

    const { rows: expenseByMonth } = await db.query(`
      SELECT
        EXTRACT(MONTH FROM expense_date) AS month,
        SUM(amount) AS expense
      FROM accounting_expenses
      WHERE EXTRACT(YEAR FROM expense_date) = $1
      GROUP BY month ORDER BY month
    `, [year]);

    // รวม 12 เดือน
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const inc = incomeByMonth.find(r => parseInt(r.month) === m);
      const exp = expenseByMonth.find(r => parseInt(r.month) === m);
      const income  = parseFloat(inc?.income  || 0);
      const expense = parseFloat(exp?.expense || 0);
      return { month: m, income, expense, profit: income - expense };
    });

    res.json({ year, months });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/accounting/user-history?userId=X ───────────────────────────────
// ประวัติทั้งหมดของ user: payment requests + coin transactions
router.get('/user-history', adminOnly, async (req, res) => {
  try {
    const db = getDB();
    const userId = parseInt(req.query.userId);
    if (!userId) return res.status(400).json({ error: 'กรุณาระบุ userId' });

    const [userRes, paymentsRes, txRes] = await Promise.all([
      db.query(`SELECT id, name, email, coin_balance, created_at FROM users WHERE id=$1`, [userId]),
      db.query(`
        SELECT id, package_key, coins, amount, sender_name, slip_url, status, admin_note, created_at
        FROM payment_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100
      `, [userId]),
      db.query(`
        SELECT id, delta, type, description, created_at
        FROM coin_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200
      `, [userId]),
    ]);

    if (!userRes.rows.length) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });

    res.json({
      user:     userRes.rows[0],
      payments: paymentsRes.rows,
      transactions: txRes.rows,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
