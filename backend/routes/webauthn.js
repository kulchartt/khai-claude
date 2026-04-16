const express = require('express');
const { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');
const jwt = require('jsonwebtoken');
const { getDB } = require('../db');
const { authMiddleware, SECRET } = require('../middleware/auth');
const router = express.Router();

const RP_ID = 'kulchartt.github.io';
const RP_NAME = 'PloiKhong';
const ORIGIN = 'https://kulchartt.github.io';

// POST /api/webauthn/register-challenge — generate options for credential creation (requires login)
router.post('/register-challenge', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });

    const options = await generateRegistrationOptions({
      rpName: RP_NAME, rpID: RP_ID,
      userID: Buffer.from(String(user.id), 'utf8'),
      userName: user.email, userDisplayName: user.name,
      timeout: 60000, attestationType: 'none',
      authenticatorSelection: { residentKey: 'discouraged', userVerification: 'preferred' },
    });

    // Store challenge
    await db.query('DELETE FROM webauthn_challenges WHERE user_id = $1 AND type = $2', [user.id, 'registration']);
    await db.query('INSERT INTO webauthn_challenges (user_id, challenge, type) VALUES ($1,$2,$3)', [user.id, options.challenge, 'registration']);

    // SimpleWebAuthn v9 returns user.id as a Buffer — convert to base64url string for JSON transport
    const safeOptions = JSON.parse(JSON.stringify(options, (key, val) => {
      if (val && val.type === 'Buffer' && Array.isArray(val.data)) {
        return Buffer.from(val.data).toString('base64url');
      }
      return val;
    }));
    res.json(safeOptions);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/webauthn/register — verify and save credential
router.post('/register', authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const { rows: cr } = await db.query(
      'SELECT * FROM webauthn_challenges WHERE user_id = $1 AND type = $2 AND expires_at > NOW() ORDER BY id DESC LIMIT 1',
      [req.user.id, 'registration']
    );
    if (!cr[0]) return res.status(400).json({ error: 'Challenge หมดอายุ กรุณาลองใหม่' });

    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: cr[0].challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified) return res.status(400).json({ error: 'ยืนยันไม่ผ่าน' });

    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
    await db.query('DELETE FROM webauthn_challenges WHERE user_id = $1 AND type = $2', [req.user.id, 'registration']);
    await db.query(
      'INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter) VALUES ($1,$2,$3,$4) ON CONFLICT (credential_id) DO UPDATE SET counter = $4',
      [req.user.id, Buffer.from(credentialID).toString('base64url'), Buffer.from(credentialPublicKey).toString('base64'), counter]
    );

    res.json({ success: true, message: 'ลงทะเบียน Biometric สำเร็จ!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/webauthn/login-challenge — generate auth options (no auth required)
router.post('/login-challenge', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'กรุณาระบุ email' });
    const db = getDB();
    const { rows: ur } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (!ur[0]) return res.status(404).json({ error: 'ไม่พบบัญชีนี้' });
    const user = ur[0];

    const { rows: creds } = await db.query('SELECT credential_id FROM webauthn_credentials WHERE user_id = $1', [user.id]);
    if (!creds.length) return res.status(404).json({ error: 'ยังไม่ได้ลงทะเบียน Biometric' });

    // Must pass as Buffer, not string — generateAuthenticationOptions calls isoBase64URL.fromBuffer()
    // which does new Uint8Array(x), and new Uint8Array("string") = empty array → id becomes ""
    const allowCredentials = creds.map(c => ({ id: Buffer.from(c.credential_id, 'base64url'), type: 'public-key' }));
    const options = await generateAuthenticationOptions({
      rpID: RP_ID, timeout: 60000, userVerification: 'preferred', allowCredentials,
    });

    await db.query('DELETE FROM webauthn_challenges WHERE user_id = $1 AND type = $2', [user.id, 'authentication']);
    await db.query('INSERT INTO webauthn_challenges (user_id, challenge, type) VALUES ($1,$2,$3)', [user.id, options.challenge, 'authentication']);

    const safeOpts = JSON.parse(JSON.stringify(options, (key, val) => {
      if (val && val.type === 'Buffer' && Array.isArray(val.data)) return Buffer.from(val.data).toString('base64url');
      return val;
    }));
    res.json({ options: safeOpts, userId: user.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/webauthn/login — verify authentication and return JWT
router.post('/login', async (req, res) => {
  try {
    const { response, userId } = req.body;
    if (!response || !userId) return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });

    const db = getDB();
    const { rows: cr } = await db.query(
      'SELECT * FROM webauthn_challenges WHERE user_id = $1 AND type = $2 AND expires_at > NOW() ORDER BY id DESC LIMIT 1',
      [userId, 'authentication']
    );
    if (!cr[0]) return res.status(400).json({ error: 'Challenge หมดอายุ' });

    const credId = response.id;
    const { rows: creds } = await db.query('SELECT * FROM webauthn_credentials WHERE user_id = $1 AND credential_id = $2', [userId, credId]);
    if (!creds[0]) return res.status(400).json({ error: 'ไม่พบ credential' });

    const authenticator = {
      credentialID: Buffer.from(creds[0].credential_id, 'base64url'),
      credentialPublicKey: Buffer.from(creds[0].public_key, 'base64'),
      counter: parseInt(creds[0].counter),
    };

    const verification = await verifyAuthenticationResponse({
      response, expectedChallenge: cr[0].challenge,
      expectedOrigin: ORIGIN, expectedRPID: RP_ID, authenticator,
    });

    if (!verification.verified) return res.status(400).json({ error: 'ยืนยันไม่ผ่าน' });

    await db.query('UPDATE webauthn_credentials SET counter = $1 WHERE id = $2', [verification.authenticationInfo.newCounter, creds[0].id]);
    await db.query('DELETE FROM webauthn_challenges WHERE user_id = $1 AND type = $2', [userId, 'authentication']);

    const { rows: ur } = await db.query('SELECT id,name,email,is_admin,is_banned FROM users WHERE id = $1', [userId]);
    const user = ur[0];
    if (user.is_banned) return res.status(403).json({ error: 'บัญชีถูกระงับ' });

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, is_admin: user.is_admin }, SECRET, { expiresIn: '30d' });
    res.json({ token, user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/webauthn/credentials — list registered credentials
router.get('/credentials', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query('SELECT id, created_at FROM webauthn_credentials WHERE user_id = $1', [req.user.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/webauthn/credentials/:id — remove a credential
router.delete('/credentials/:id', authMiddleware, async (req, res) => {
  try {
    await getDB().query('DELETE FROM webauthn_credentials WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
