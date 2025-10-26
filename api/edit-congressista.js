// api/edit-congressista.js
// API para editar dados extras de congressistas

const { Octokit } = require('@octokit/rest');
const yaml = require('js-yaml');

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

const REPO = {
  owner: 'juliocjd',
  repo: 'pautas-socioeducativas'
};

const FILE_PATH = '_data/congressistas_extras.yml';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // GET - Buscar dados de um congressista
    if (req.method === 'GET') {
      const { parlamentar_id } = req.query;
      
      if (!parlamentar_id) {
        return res.status(400).json({ 
          success: false, 
          error: 'parlamentar_id é obrigatório' 
        });
      }

      try {
        const { data: fileData } = await octokit.rest.repos.getContent({
          ...REPO,
          path: FILE_PATH
        });

        const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
        const data = yaml.load(content);

        const congressista = data.congressistas?.[parlamentar_id] || {};

        return res.status(200).json({ 
          success: true,
          dados: congressista,
          sha: fileData.sha
        });
      } catch (error) {
        if (error.status === 404) {
          return res.status(200).json({ 
            success: true, 
            dados: {},
            sha: null
          });
        }
        throw error;
      }
    }

    // PUT - Atualizar dados de um congressista
    if (req.method === 'PUT') {
      const { parlamentar_id, dados } = req.body;

      if (!parlamentar_id || !dados) {
        return res.status(400).json({ 
          success: false, 
          error: 'parlamentar_id e dados são obrigatórios' 
        });
      }

      // Verificar autenticação
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Não autorizado' });
      }

      // Buscar arquivo atual (ou criar se não existir)
      let fileData, currentData;
      
      try {
        const response = await octokit.rest.repos.getContent({
          ...REPO,
          path: FILE_PATH
        });
        fileData = response.data;
        const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
        currentData = yaml.load(content);
      } catch (error) {
        if (error.status === 404) {
          // Arquivo não existe, criar
          currentData = { congressistas: {} };
          fileData = null;
        } else {
          throw error;
        }
      }

      // Atualizar dados
      if (!currentData.congressistas) {
        currentData.congressistas = {};
      }
      
      currentData.congressistas[parlamentar_id] = {
        ...dados,
        ultima_atualizacao: new Date().toISOString().split('T')[0]
      };

      // Salvar
      const newContent = yaml.dump(currentData);

      const params = {
        ...REPO,
        path: FILE_PATH,
        message: `Atualizar dados de ${parlamentar_id}`,
        content: Buffer.from(newContent).toString('base64')
      };

      if (fileData) {
        params.sha = fileData.sha;
      }

      await octokit.rest.repos.createOrUpdateFileContents(params);

      return res.status(200).json({ 
        success: true,
        message: 'Dados atualizados com sucesso'
      });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });

  } catch (error) {
    console.error('Erro na API /api/edit-congressista:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
