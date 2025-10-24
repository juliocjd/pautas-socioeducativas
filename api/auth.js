// API endpoint para autenticação OAuth do GitHub
// Este arquivo deve estar em: api/auth.js

module.exports = async (req, res) => {
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

  // Pega o código de autorização da query string
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: 'Código de autorização não fornecido' });
  }

  try {
    // Troca o código pelo token de acesso
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code
      })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Erro ao obter token:', tokenData);
      return res.status(400).json({ error: tokenData.error_description });
    }

    // Retorna o token para o Netlify CMS
    return res.status(200).json({
      token: tokenData.access_token,
      provider: 'github'
    });

  } catch (error) {
    console.error('Erro na autenticação:', error);
    return res.status(500).json({ 
      error: 'Erro ao processar autenticação',
      details: error.message 
    });
  }
};