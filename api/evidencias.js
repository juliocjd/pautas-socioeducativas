// api/evidencias.js
// CRUD para evidências de posicionamento (específicas por pauta)

const https = require('https');
const yaml = require('js-yaml');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'juliocjd';
const REPO_NAME = 'pautas-socioeducativas';
const FILE_PATH = '_data/evidencias_pautas.yml';

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
    // GET - Listar evidências (opcionalmente filtradas por pauta)
    if (req.method === 'GET') {
      const { pauta_slug } = req.query;
      const data = await getEvidenciasData();
      
      if (pauta_slug && data.pautas && data.pautas[pauta_slug]) {
        return res.status(200).json({ evidencias: data.pautas[pauta_slug] });
      }
      
      return res.status(200).json({ pautas: data.pautas || {} });
    }

    // POST - Adicionar evidência
    if (req.method === 'POST') {
      const { pauta_slug, parlamentar_id, posicao, evidencia } = req.body;
      
      if (!pauta_slug || !parlamentar_id) {
        return res.status(400).json({ error: 'pauta_slug e parlamentar_id são obrigatórios' });
      }

      const result = await addEvidencia(pauta_slug, parlamentar_id, posicao, evidencia);
      return res.status(200).json(result);
    }

    // DELETE - Remover evidência
    if (req.method === 'DELETE') {
      const { pauta_slug, parlamentar_id } = req.body;
      
      if (!pauta_slug || !parlamentar_id) {
        return res.status(400).json({ error: 'pauta_slug e parlamentar_id são obrigatórios' });
      }

      const result = await deleteEvidencia(pauta_slug, parlamentar_id);
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: 'Método não permitido' });

  } catch (error) {
    console.error('Erro:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Buscar dados atuais
async function getEvidenciasData() {
  try {
    const fileData = await githubRequest('GET', `/contents/${FILE_PATH}`);
    const content = Buffer.from(fileData.content, 'base64').toString('utf8');
    return yaml.load(content) || { pautas: {} };
  } catch (error) {
    if (error.message.includes('Not Found')) {
      return { pautas: {} };
    }
    throw error;
  }
}

// Adicionar evidência
async function addEvidencia(pauta_slug, parlamentar_id, posicao, evidencia) {
  const data = await getEvidenciasData();
  
  if (!data.pautas) {
    data.pautas = {};
  }
  if (!data.pautas[pauta_slug]) {
    data.pautas[pauta_slug] = {};
  }
  if (!data.pautas[pauta_slug][parlamentar_id]) {
    data.pautas[pauta_slug][parlamentar_id] = {
      posicao: posicao || 'nao-manifestado',
      evidencias: []
    };
  }

  // Adicionar evidência se fornecida
  if (evidencia && evidencia.url) {
    if (!data.pautas[pauta_slug][parlamentar_id].evidencias) {
      data.pautas[pauta_slug][parlamentar_id].evidencias = [];
    }
    
    data.pautas[pauta_slug][parlamentar_id].evidencias.push({
      tipo: evidencia.tipo || 'link',
      url: evidencia.url,
      data: new Date().toISOString().split('T')[0],
      descricao: evidencia.descricao || ''
    });
  }

  // Atualizar posição se fornecida
  if (posicao) {
    data.pautas[pauta_slug][parlamentar_id].posicao = posicao;
  }

  // Salvar
  const yamlContent = yaml.dump(data, { indent: 2, lineWidth: -1 });
  
  try {
    const fileData = await githubRequest('GET', `/contents/${FILE_PATH}`);
    
    await githubRequest('PUT', `/contents/${FILE_PATH}`, {
      message: `Adicionar evidência - ${pauta_slug} - ${parlamentar_id}`,
      content: Buffer.from(yamlContent).toString('base64'),
      sha: fileData.sha
    });
  } catch (error) {
    if (error.message.includes('Not Found')) {
      await githubRequest('PUT', `/contents/${FILE_PATH}`, {
        message: `Criar arquivo de evidências`,
        content: Buffer.from(yamlContent).toString('base64')
      });
    } else {
      throw error;
    }
  }

  return { success: true, message: 'Evidência adicionada com sucesso' };
}

// Remover evidência
async function deleteEvidencia(pauta_slug, parlamentar_id) {
  const data = await getEvidenciasData();
  
  if (!data.pautas || !data.pautas[pauta_slug] || !data.pautas[pauta_slug][parlamentar_id]) {
    return { success: false, message: 'Evidência não encontrada' };
  }

  delete data.pautas[pauta_slug][parlamentar_id];

  // Se a pauta ficou vazia, remove ela também
  if (Object.keys(data.pautas[pauta_slug]).length === 0) {
    delete data.pautas[pauta_slug];
  }

  const yamlContent = yaml.dump(data, { indent: 2, lineWidth: -1 });
  const fileData = await githubRequest('GET', `/contents/${FILE_PATH}`);
  
  await githubRequest('PUT', `/contents/${FILE_PATH}`, {
    message: `Remover evidência - ${pauta_slug} - ${parlamentar_id}`,
    content: Buffer.from(yamlContent).toString('base64'),
    sha: fileData.sha
  });

  return { success: true, message: 'Evidência removida com sucesso' };
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
