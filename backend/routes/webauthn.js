const express = require('express');
const { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');
const jwt = require('jsonwebtoken');
const { getDB } = require('../db');
const { authMiddleware, SECRET } = require('../middleware/auth');
const router = express.Router();

const RP_ID = 'kulchartt.github.io';
const RP_NAME = 'PloiKhong';
const ORIGIN = 'https://kulchartt.github.io';

// ──────────────────────────────────────────────────────────────
// AAGUID → Authenticator name lookup
// Source: https://github.com/passkeydeveloper/passkey-authenticator-aaguids
// ──────────────────────────────────────────────────────────────
const AAGUID_MAP = {
  // Windows Hello
  '08987058-cadc-4b81-b6e1-30de50dcbe96': { name: 'Windows Hello', icon: '🪟' },
  '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': { name: 'Windows Hello', icon: '🪟' },
  '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': { name: 'Windows Hello (Hardware)', icon: '🪟' },
  'b92c3f9a-c014-4056-887f-140a2501163b': { name: 'Windows Hello', icon: '🪟' },
  'aadca000-0000-0000-0000-000000000000': { name: 'Windows Hello', icon: '🪟' },
  '08987058-cadc-4b81-b6e1-30de50dcbe97': { name: 'Windows Hello', icon: '🪟' },
  // Apple (Touch ID / Face ID)
  'dd4ec289-e01d-41c9-bb89-70fa845d4bf2': { name: 'Apple Touch ID / Face ID', icon: '🍎' },
  'adce0002-35bc-c60a-648b-0b25f1f05503': { name: 'Apple Touch ID (Chrome)', icon: '🍎' },
  'adce0003-35bc-c60a-648b-0b25f1f05503': { name: 'Apple Touch ID', icon: '🍎' },
  'bada5566-a7aa-401f-bd96-45619a55120d': { name: 'Apple Passkey', icon: '🍎' },
  // Google / Android
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': { name: 'Google Password Manager', icon: '🔵' },
  'b5397666-4885-aa6b-cebf-e52262a439a2': { name: 'Chrome Touch ID (Mac)', icon: '🔵' },
  'b93fd961-f2e6-462f-b122-82002247de78': { name: 'Android Fingerprint', icon: '📱' },
  'de503ab9-519a-4a9d-9a9e-8d0c4ef50a9a': { name: 'Android (Pixel)', icon: '📱' },
  '12ded745-4bed-47d4-abaa-e713f51d6393': { name: 'Android Fingerprint', icon: '📱' },
  // Samsung
  '53414d53-554e-4700-0000-000000000000': { name: 'Samsung Pass', icon: '📱' },
  // YubiKey
  'fa2b99dc-9e39-4257-8f92-4a30d23c4118': { name: 'YubiKey 5', icon: '🔑' },
  'cb69481e-8ff7-4039-93ec-0a2729a154a8': { name: 'YubiKey 5 NFC', icon: '🔑' },
  'c1f9a0bc-1dd2-404a-b27f-8e29047a43fd': { name: 'YubiKey 5C NFC', icon: '🔑' },
  'ee882879-721c-4913-9775-3dfcce97072a': { name: 'YubiKey 5 Series', icon: '🔑' },
  '2fc0579f-8113-47ea-b116-bb5a8db9202a': { name: 'YubiKey 5 Series', icon: '🔑' },
  // 1Password
  'bada5566-a7aa-401f-bd96-45619a55120e': { name: '1Password', icon: '🔐' },
  // Bitwarden
  'd548826e-79b4-db40-a3d8-11116f7e8349': { name: 'Bitwarden', icon: '🔐' },
  // iCloud Keychain
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': { name: 'iCloud Keychain', icon: '☁️' },
};

function getDeviceInfo(aaguid) {
  if (!aaguid || aaguid === '00000000-0000-0000-0000-000000000000') {
    return { name: 'Platform Authenticator', icon: '🔒' };
  }
  return AAGUID_MAP[aaguid.toLowerCase()] || { name: 'Security Key', icon: '🔑' };
}

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

    const { credentialID, credentialPublicKey, counter, aaguid } = verification.registrationInfo;
    await db.query('DELETE FROM webauthn_challenges WHERE user_id = $1 AND type = $2', [req.user.id, 'registration']);
    await db.query(
      `INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, aaguid)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (credential_id) DO UPDATE SET counter = $4, aaguid = $5`,
      [
        req.user.id,
        Buffer.from(credentialID).toString('base64url'),
        Buffer.from(credentialPublicKey).toString('base64'),
        counter,
        aaguid || '',
      ]
    );

    const deviceInfo = getDeviceInfo(aaguid);
    res.json({ success: true, message: `ลงทะเบียน ${deviceInfo.name} ${deviceInfo.icon} สำเร็จ!` });
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

// GET /api/webauthn/credentials — list registered credentials with device info
router.get('/credentials', authMiddleware, async (req, res) => {
  try {
    const { rows } = await getDB().query(
      'SELECT id, created_at, aaguid FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at ASC',
      [req.user.id]
    );
    const result = rows.map(r => ({
      ...r,
      device: getDeviceInfo(r.aaguid),
    }));
    res.json(result);
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
