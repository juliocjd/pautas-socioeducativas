// api/auth.js
module.exports = async (req, res) => {
  // Log para debug
  console.log('🔍 Request recebida em /api/auth');
  console.log('Query params:', req.query);
  console.log('Method:', req.method);
  
  // Configurações do GitHub OAuth App
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  
  // Verifica se as variáveis de ambiente estão configuradas
  if (!clientId || !clientSecret) {
    console.error('❌ GITHUB_CLIENT_ID ou GITHUB_CLIENT_SECRET não configurados');
    return res.status(500).json({ 
      error: 'Configuração OAuth incompleta. Configure as variáveis de ambiente na Vercel.' 
    });
  }

  // Suporte para GET e POST
  const code = req.query.code || req.body?.code;
  
  if (!code) {
    console.error('❌ Código não encontrado. Query:', req.query);
    return res.status(400).json({ 
      error: 'Código de autorização não fornecido',
      debug: {
        query: req.query,
        body: req.body
      }
    });
  }

  console.log('✅ Código recebido:', code.substring(0, 10) + '...');

  try {
    // Troca o código pelo token de acesso
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'applicat
