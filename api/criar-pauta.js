// api/criar-pauta.js
// Cria arquivo de pauta diretamente no GitHub

const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'juliocjd';
const REPO_NAME = 'pautas-socioeducativas';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: 'GitHub Token não configurado' });
  }

  try {
    const { filename, content } = req.body;

    if (!filename || !content) {
      return res.status(400).json({ error: 'Filename e content são obrigatórios' });
    }

    // Verificar se arquivo já existe
    let fileExists = false;
    let existingSha = null;

    try {
      const existingFile = await githubRequest('GET', `/contents/_pautas/${filename}`);
      fileExists = true;
      existingSha = existingFile.sha;
    } catch (error) {
      // Arquivo não existe, tudo certo
      if (!error.message.includes('Not Found')) {
        throw error;
      }
    }

    // Se arquivo existe, retorna erro
    if (fileExists) {
      return res.status(409).json({ 
        error: 'Uma pauta com este nome já existe',
        filename: filename,
        suggestion: 'Escolha um título diferente ou delete a pauta existente primeiro'
      });
    }

    // Criar arquivo no GitHub
    const result = await githubRequest('PUT', `/contents/_pautas/${filename}`, {
      message: `Adicionar pauta: ${filename}`,
      content: Buffer.from(content).toString('base64')
    });

    return res.status(201).json({
      success: true,
      message: 'Pauta criada com sucesso!',
      filename: filename,
      url: result.content.html_url,
      site_url: `https://pautas-socioeducativas.vercel.app/pautas/${filename.replace('.md', '')}/`
    });

  } catch (error) {
    console.error('Erro ao criar pauta:', error);
    return res.status(500).json({ 
      error: 'Erro ao criar pauta',
      details: error.message 
    });
  }
};

// Função auxiliar para requisições ao GitHub
function githubRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${REPO_OWNER}/${REPO_NAME}${path}`,
      method: method,
      headers: {
        'User-Agent': 'Pautas-Admin',
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (response.statusCode >= 400) {
            reject(new Error(result.message || 'Erro no GitHub'));
          } else {
            resolve(result);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}
