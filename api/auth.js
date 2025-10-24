// api/auth.js
const https = require('https');

module.exports = async (req, res) => {
  // Permite CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log('🔍 Request recebida em /api/auth');
  console.log('Query params:', req.query);
  console.log('Method:', req.method);
  
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    console.error('❌ Variáveis de ambiente não configuradas');
    return res.status(500).json({ 
      error: 'Configuração OAuth incompleta'
    });
  }

  const code = req.query.code || req.body?.code;
  
  if (!code) {
    console.error('❌ Código não fornecido');
    return res.status(400).json({ 
      error: 'Código de autorização não fornecido'
    });
  }

  console.log('✅ Código recebido');

  // Dados para enviar ao GitHub
  const postData = JSON.stringify({
    client_id: clientId,
    client_secret: clientSecret,
    code: code
  });

  const options = {
    hostname: 'github.com',
    port: 443,
    path: '/login/oauth/access_token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-Length': postData.length
    }
  };

  // Faz a requisição ao GitHub
  const githubRequest = https.request(options, (githubRes) => {
    let data = '';

    githubRes.on('data', (chunk) => {
      data += chunk;
    });

    githubRes.on('end', () => {
      try {
        const tokenData = JSON.parse(data);
        console.log('📥 Resposta do GitHub');

        if (tokenData.error) {
          console.error('❌ Erro do GitHub:', tokenData.error);
          return res.status(400).json({ 
            error: tokenData.error_description || tokenData.error 
          });
        }

        if (!tokenData.access_token) {
          console.error('❌ Token não recebido');
          return res.status(400).json({ 
            error: 'Token de acesso não recebido' 
          });
        }

        console.log('✅ Token obtido com sucesso!');

        // Retorna o token
        return res.status(200).json({
          token: tokenData.access_token,
          provider: 'github'
        });

      } catch (error) {
        console.error('❌ Erro ao processar resposta:', error);
        return res.status(500).json({ 
          error: 'Erro ao processar resposta do GitHub' 
        });
      }
    });
  });

  githubRequest.on('error', (error) => {
    console.error('❌ Erro na requisição:', error);
    return res.status(500).json({ 
      error: 'Erro ao conectar com GitHub',
      details: error.message 
    });
  });

  // Envia os dados
  githubRequest.write(postData);
  githubRequest.end();
};
