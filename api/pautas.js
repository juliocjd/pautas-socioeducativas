// api/pautas.js
// Lista todas as pautas cadastradas ou cria/exclui pautas

const { Octokit } = require('@octokit/rest');

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

const REPO = {
  owner: 'juliocjd',
  repo: 'pautas-socioeducativas'
};

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // GET - Listar pautas
    if (req.method === 'GET') {
      const { data: files } = await octokit.rest.repos.getContent({
        ...REPO,
        path: 'pautas'
      });

      const pautas = [];
      
      for (const file of files) {
        if (file.name.endsWith('.md')) {
          try {
            const { data: fileContent } = await octokit.rest.repos.getContent({
              ...REPO,
              path: file.path
            });

            const content = Buffer.from(fileContent.content, 'base64').toString('utf-8');
            
            // Parse front matter
            const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (frontMatterMatch) {
              const frontMatter = frontMatterMatch[1];
              const lines = frontMatter.split('\n');
              const pauta = { filename: file.name };
              
              lines.forEach(line => {
                const match = line.match(/^(\w+):\s*(.+)$/);
                if (match) {
                  const key = match[1];
                  let value = match[2].trim();
                  
                  // Remove aspas
                  if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1);
                  }
                  
                  // Parse booleans
                  if (value === 'true') value = true;
                  if (value === 'false') value = false;
                  
                  pauta[key] = value;
                }
              });
              
              pautas.push(pauta);
            }
          } catch (error) {
            console.error(`Erro ao processar ${file.name}:`, error.message);
          }
        }
      }

      return res.status(200).json({ success: true, pautas });
    }

    // DELETE - Excluir pauta
    if (req.method === 'DELETE') {
      const { filename } = req.body;
      
      if (!filename) {
        return res.status(400).json({ success: false, message: 'Filename é obrigatório' });
      }

      // Verificar autenticação
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Não autorizado' });
      }

      // Buscar SHA do arquivo
      const { data: fileData } = await octokit.rest.repos.getContent({
        ...REPO,
        path: `pautas/${filename}`
      });

      // Excluir arquivo
      await octokit.rest.repos.deleteFile({
        ...REPO,
        path: `pautas/${filename}`,
        message: `Excluir pauta: ${filename}`,
        sha: fileData.sha
      });

      return res.status(200).json({ success: true, message: 'Pauta excluída com sucesso' });
    }

    return res.status(405).json({ success: false, message: 'Método não permitido' });

  } catch (error) {
    console.error('Erro na API /api/pautas:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
