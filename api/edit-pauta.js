// api/edit-pauta.js
// API para editar pautas existentes

const { Octokit } = require('@octokit/rest');

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

const REPO = {
  owner: 'juliocjd',
  repo: 'pautas-socioeducativas'
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // GET - Buscar dados da pauta
    if (req.method === 'GET') {
      const { filename } = req.query;
      
      if (!filename) {
        return res.status(400).json({ 
          success: false, 
          error: 'filename é obrigatório' 
        });
      }

      const { data: fileData } = await octokit.rest.repos.getContent({
        ...REPO,
        path: `pautas/${filename}`
      });

      const content = Buffer.from(fileData.content, 'base64').toString('utf-8');

      return res.status(200).json({ 
        success: true,
        content: content,
        sha: fileData.sha
      });
    }

    // PUT - Atualizar pauta
    if (req.method === 'PUT') {
      const { filename, content } = req.body;

      if (!filename || !content) {
        return res.status(400).json({ 
          success: false, 
          error: 'filename e content são obrigatórios' 
        });
      }

      // Verificar autenticação
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Não autorizado' });
      }

      const filePath = `pautas/${filename}`;

      // Buscar SHA atual
      const { data: fileData } = await octokit.rest.repos.getContent({
        ...REPO,
        path: filePath
      });

      // Atualizar arquivo
      await octokit.rest.repos.createOrUpdateFileContents({
        ...REPO,
        path: filePath,
        message: `Atualizar pauta: ${filename}`,
        content: Buffer.from(content).toString('base64'),
        sha: fileData.sha
      });

      return res.status(200).json({ 
        success: true,
        message: 'Pauta atualizada com sucesso'
      });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });

  } catch (error) {
    console.error('Erro na API /api/edit-pauta:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
