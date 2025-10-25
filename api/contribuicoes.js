// api/contribuicoes.js
// Recebe contribuições de usuários e cria Pull Requests no GitHub

const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'juliocjd';
const REPO_NAME = 'pautas-socioeducativas';

module.exports = async (req, res) => {
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
    const { 
      parlamentar_id,
      parlamentar_nome,
      pauta_slug,
      dados_contato,      // { whatsapp, instagram, telefone_gabinete, assessores: [...] }
      evidencia,          // { tipo, url, descricao }
      usuario_nome,
      usuario_email 
    } = req.body;

    if (!parlamentar_id || !parlamentar_nome) {
      return res.status(400).json({ error: 'ID e nome do parlamentar são obrigatórios' });
    }

    // Criar estrutura da contribuição
    const timestamp = Date.now();
    const filename = `contribuicao-${timestamp}.yml`;
    
    let content = `---
parlamentar_id: "${parlamentar_id}"
parlamentar_nome: "${parlamentar_nome}"
pauta_slug: "${pauta_slug || ''}"
data_envio: "${new Date().toISOString()}"
usuario_nome: "${usuario_nome || 'Anônimo'}"
usuario_email: "${usuario_email || 'não informado'}"
status: "pendente"

# DADOS DE CONTATO (permanentes)
dados_contato:\n`;

    if (dados_contato) {
      if (dados_contato.whatsapp) {
        content += `  whatsapp: "${dados_contato.whatsapp}"\n`;
      }
      if (dados_contato.instagram) {
        content += `  instagram: "${dados_contato.instagram}"\n`;
      }
      if (dados_contato.telefone_gabinete) {
        content += `  telefone_gabinete: "${dados_contato.telefone_gabinete}"\n`;
      }
      if (dados_contato.assessores && dados_contato.assessores.length > 0) {
        content += `  assessores:\n`;
        dados_contato.assessores.forEach(ass => {
          content += `    - nome: "${ass.nome}"\n`;
          content += `      whatsapp: "${ass.whatsapp}"\n`;
          content += `      cargo: "${ass.cargo || 'Assessor(a)'}"\n`;
        });
      }
    }

    content += `\n# EVIDÊNCIA DE POSICIONAMENTO (específica da pauta)\n`;
    if (evidencia && evidencia.url) {
      content += `evidencia:
  tipo: "${evidencia.tipo || 'link'}"
  url: "${evidencia.url}"
  descricao: "${evidencia.descricao || ''}"
  pauta: "${pauta_slug}"\n`;
    } else {
      content += `evidencia: null\n`;
    }

    content += `---`;

    // Criar branch para a contribuição
    const branchName = `contribuicao-${timestamp}`;
    
    // 1. Pegar SHA da main
    const mainRef = await githubRequest('GET', '/git/refs/heads/main');
    const mainSha = mainRef.object.sha;

    // 2. Criar nova branch
    await githubRequest('POST', '/git/refs', {
      ref: `refs/heads/${branchName}`,
      sha: mainSha
    });

    // 3. Criar arquivo na branch
    await githubRequest('PUT', `/contents/_data/contribuicoes/${filename}`, {
      message: `Nova contribuição: ${parlamentar_nome}`,
      content: Buffer.from(content).toString('base64'),
      branch: branchName
    });

    // 4. Criar Pull Request
    const prBody = `## 📬 Nova Contribuição de Usuário

**Parlamentar:** ${parlamentar_nome} (ID: ${parlamentar_id})
**Pauta:** ${pauta_slug || 'N/A'}
**Data:** ${new Date().toLocaleString('pt-BR')}

---

### 📋 Dados Enviados:

${dados_contato ? `
**📞 Dados de Contato:**
${dados_contato.whatsapp ? `- WhatsApp: ${dados_contato.whatsapp}` : ''}
${dados_contato.instagram ? `- Instagram: @${dados_contato.instagram}` : ''}
${dados_contato.telefone_gabinete ? `- Tel. Gabinete: ${dados_contato.telefone_gabinete}` : ''}
${dados_contato.assessores ? `- Assessores: ${dados_contato.assessores.length}` : ''}
` : 'Nenhum dado de contato enviado.'}

${evidencia && evidencia.url ? `
**📄 Evidência de Posicionamento:**
- Tipo: ${evidencia.tipo}
- Link: ${evidencia.url}
- Descrição: ${evidencia.descricao}
` : 'Nenhuma evidência enviada.'}

---

**Enviado por:** ${usuario_nome || 'Anônimo'} (${usuario_email || 'não informado'})

---

### ✅ Como Aprovar:

1. Acesse o painel admin: https://pautas-socioeducativas.vercel.app/tools/gerador.html
2. Vá na aba "📬 Contribuições Pendentes"
3. Revise os dados e aprove seletivamente

**OU**

Faça merge manualmente deste PR para aprovar tudo.`;

    const pr = await githubRequest('POST', '/pulls', {
      title: `📝 Contribuição: ${parlamentar_nome}`,
      head: branchName,
      base: 'main',
      body: prBody
    });

    return res.status(201).json({
      success: true,
      message: 'Contribuição enviada com sucesso! Será revisada pelo administrador.',
      pr_number: pr.number,
      pr_url: pr.html_url
    });

  } catch (error) {
    console.error('Erro ao processar contribuição:', error);
    return res.status(500).json({ 
      error: 'Erro ao enviar contribuição',
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
        'User-Agent': 'Pautas-Contribuicoes',
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
