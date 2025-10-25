// api/auth-admin.js
// Autenticação segura para o painel administrativo

const crypto = require('crypto');

// Configuração
const SENHA_HASH = process.env.ADMIN_PASSWORD_HASH; // Hash SHA256 da senha
const TOKEN_SECRET = process.env.TOKEN_SECRET; // Segredo para gerar tokens

module.exports = async (req, res) => {
  // Permite CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Senha não fornecida' });
    }

    // Gera hash da senha fornecida
    const passwordHash = crypto
      .createHash('sha256')
      .update(password)
      .digest('hex');

    // Compara com o hash armazenado
    if (passwordHash !== SENHA_HASH) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    // Gera um token de sessão (válido por 24h)
    const token = crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(Date.now().toString())
      .digest('hex');

    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 horas

    return res.status(200).json({
      success: true,
      token: token,
      expiresAt: expiresAt
    });

  } catch (error) {
    console.error('Erro na autenticação:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
