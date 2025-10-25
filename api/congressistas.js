// api/congressistas.js
// CRUD para dados extras dos congressistas (contatos permanentes)

const https = require('https');
const yaml = require('js-yaml');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'juliocjd';
const REPO_NAME = 'pautas-socioeducativas';
const FILE_PATH = '_data/congressistas_extras.yml';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: 'GitHub Token não configurado' });
  }

  try {
    // GET - Listar todos os dados
    if (req.method === 'GET') {
      const data = await getCongressistasData();
      return res.status(200).json({ congressistas: data.congressistas || {} });
    }

    // POST - Adicionar/Atualizar dados de um congressista
    if (req.method === 'POST') {
      const { parlamentar_id, dados } = req.body;
      
      if (!parlamentar_id || !dados) {
        return res.status(400).json({ error: 'parlamentar_id e dados são obrigatórios' });
      }

      const result = await updateCongressista(parlamentar_id, dados);
      return res.status(200).json(result);
    }

    // DELETE - Remover dados de um congressista
    if (req.method === 'DELETE') {
      const { parlamentar_id } = req.body;
      
      if (!parlamentar_id) {
        return res.status(400).json({ error: 'parlamentar_id é obrigatório' });
      }

      const result = await deleteCongressista(parlamentar_id);
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: 'Método não permitido' });

  } catch (error) {
    console.error('Erro:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Buscar dados atuais do arquivo
async function getCongressistasData() {
  try {
    const fileData = await githubRequest('GET', `/contents/${FILE_PATH}`);
    const content = Buffer.from(fileData.content, 'base64').toString('utf8');
    return yaml.load(content) || { congressistas: {} };
  } catch (error) {
    // Se arquivo não existe, retorna estrutura vazia
    if (error.message.includes('Not Found')) {
      return { congressistas: {} };
    }
    throw error;
  }
}

// Atualizar dados de um congressista
async function updateCongressista(parlamentar_id, novos_dados) {
  const data = await getCongressistasData();
  
  if (!data.congressistas) {
    data.congressistas = {};
  }

  // Mesclar dados novos com existentes
  if (!data.congressistas[parlamentar_id]) {
    data.congressistas[parlamentar_id] = {};
  }

  // Verificar duplicatas
  const existente = data.congressistas[parlamentar_id];
  const duplicatas = [];

  if (novos_dados.whatsapp && existente.whatsapp === novos_dados.whatsapp) {
    duplicatas.push('whatsapp');
  }
  if (novos_dados.instagram && existente.instagram === novos_dados.instagram) {
    duplicatas.push('instagram');
  }

  // Se não tem duplicatas, atualiza
  Object.assign(data.congressistas[parlamentar_id], novos_dados);
  data.congressistas[parlamentar_id].ultima_atualizacao = new Date().toISOString().split('T')[0];

  // Salvar no GitHub
  const yamlContent = yaml.dump(data, { indent: 2, lineWidth: -1 });
  
  try {
    const fileData = await githubRequest('GET', `/contents/${FILE_PATH}`);
    
    await githubRequest('PUT', `/contents/${FILE_PATH}`, {
      message: `Atualizar dados do congressista ${parlamentar_id}`,
      content: Buffer.from(yamlContent).toString('base64'),
      sha: fileData.sha
    });
  } catch (error) {
    // Se arquivo não existe, cria novo
    if (error.message.includes('Not Found')) {
      await githubRequest('PUT', `/contents/${FILE_PATH}`, {
        message: `Criar arquivo de dados de congressistas`,
        content: Buffer.from(yamlContent).toString('base64')
      });
    } else {
      throw error;
    }
  }

  return {
    success: true,
    message: 'Dados atualizados com sucesso',
    duplicatas: duplicatas.length > 0 ? duplicatas : null
  };
}

// Remover dados de um congressista
async function deleteCongressista(parlamentar_id) {
  const data = await getCongressistasData();
  
  if (!data.congressistas || !data.congressistas[parlamentar_id]) {
    return { success: false, message: 'Congressista não encontrado' };
  }

  delete data.congressistas[parlamentar_id];

  const yamlContent = yaml.dump(data, { indent: 2, lineWidth: -1 });
  const fileData = await githubRequest('GET', `/contents/${FILE_PATH}`);
  
  await githubRequest('PUT', `/contents/${FILE_PATH}`, {
    message: `Remover dados do congressista ${parlamentar_id}`,
    content: Buffer.from(yamlContent).toString('base64'),
    sha: fileData.sha
  });

  return { success: true, message: 'Dados removidos com sucesso' };
}

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
