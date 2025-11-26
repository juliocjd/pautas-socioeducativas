// api/auth-admin.js
// Autentica administrador (suporta senha hash ou texto plano)

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Senha é obrigatória' 
      });
    }

    // Verificar qual variável existe no ambiente
    const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

    if (!ADMIN_PASSWORD_HASH && !ADMIN_PASSWORD) {
      return res.status(500).json({ 
        success: false, 
        error: 'Configuração de senha não encontrada. Configure ADMIN_PASSWORD_HASH ou ADMIN_PASSWORD no Vercel.' 
      });
    }

    let isValid = false;

    // Se tiver hash, verificar com hash
    if (ADMIN_PASSWORD_HASH) {
      if (ADMIN_PASSWORD_HASH.startsWith('$2')) {
        // Hash em bcrypt ($2a$, $2b$, etc.)
        isValid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
      } else {
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        isValid = hash === ADMIN_PASSWORD_HASH;
      }
    } 
    // Se não tiver hash, verificar senha em texto plano
    else if (ADMIN_PASSWORD) {
      isValid = password === ADMIN_PASSWORD;
    }

    if (isValid) {
      // Gerar token simples (em produção, use JWT)
      const token = Buffer.from(`admin:${Date.now()}`).toString('base64');
      const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 horas

      return res.status(200).json({ 
        success: true,
        token: token,
        expiresAt: expiresAt
      });
    } else {
      return res.status(401).json({ 
        success: false, 
        error: 'Senha incorreta' 
      });
    }

  } catch (error) {
    console.error('Erro na API /api/auth-admin:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
