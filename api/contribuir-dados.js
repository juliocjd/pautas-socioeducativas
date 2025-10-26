// API para receber contribuições de DADOS de parlamentares
// WhatsApp, Instagram, Assessores, Evidências
import { Octokit } from '@octokit/rest';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const { 
        parlamentar_id, 
        parlamentar_nome, 
        pauta_slug,
        dados_contato, 
        evidencia,
        usuario_nome,
        usuario_email 
      } = req.body;

      // Validação
      if (!parlamentar_id || !parlamentar_nome) {
        return res.status(400).json({ 
          error: 'ID e nome do parlamentar são obrigatórios',
          campos_recebidos: Object.keys(req.body)
        });
      }

      if (!usuario_nome || !usuario_email) {
        return res.status(400).json({ 
          error: 'Seu nome e email são obrigatórios' 
        });
      }

      // Validar que pelo menos um dado foi enviado
      const temDados = dados_contato && Object.keys(dados_contato).length > 0;
      const temEvidencia = evidencia && evidencia.url;

      if (!temDados && !temEvidencia) {
        return res.status(400).json({ 
          error: 'Envie pelo menos um dado de contato ou evidência' 
        });
      }

      const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN
      });

      const owner = process.env.GITHUB_OWNER || 'juliocjd';
      const repo = process.env.GITHUB_REPO || 'pautas-socioeducativas';
      const branch = 'main';

      console.log('📝 Nova contribuição de dados:', { 
        parlamentar_id, 
        parlamentar_nome,
        usuario: usuario_nome 
      });

      // Criar branch para o PR
      const branchName = `contrib-dados-${parlamentar_id}-${Date.now()}`;

      // Obter referência da branch main
      const { data: refData } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`
      });

      // Criar nova branch
      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: refData.object.sha
      });

      console.log(`✅ Branch criada: ${branchName}`);

      // Buscar arquivo atual de congressistas
      let congressistas = {};
      let fileSha = null;

      try {
        const { data: fileData } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: 'api/congressistas-dados.json',
          ref: branch
        });

        fileSha = fileData.sha;
        const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
        congressistas = JSON.parse(content);
      } catch (error) {
        if (error.status === 404) {
          console.log('ℹ️ Arquivo congressistas.json não existe, será criado');
          congressistas = {};
        } else {
          throw error;
        }
      }

      // Atualizar ou criar entrada do parlamentar
      if (!congressistas[parlamentar_id]) {
        congressistas[parlamentar_id] = {};
      }

      const parlamentar = congressistas[parlamentar_id];

      // Adicionar dados de contato
      if (dados_contato) {
        if (dados_contato.whatsapp) {
          if (!parlamentar.whatsapp) {
            parlamentar.whatsapp = [];
          }
          if (!Array.isArray(parlamentar.whatsapp)) {
            parlamentar.whatsapp = [parlamentar.whatsapp];
          }
          if (!parlamentar.whatsapp.includes(dados_contato.whatsapp)) {
            parlamentar.whatsapp.push(dados_contato.whatsapp);
          }
        }

        if (dados_contato.instagram) {
          parlamentar.instagram = dados_contato.instagram;
        }

        if (dados_contato.assessores && dados_contato.assessores.length > 0) {
          if (!parlamentar.assessores) {
            parlamentar.assessores = [];
          }
          dados_contato.assessores.forEach(novoAss => {
            const existe = parlamentar.assessores.some(a => a.whatsapp === novoAss.whatsapp);
            if (!existe) {
              parlamentar.assessores.push(novoAss);
            }
          });
        }
      }

      // Adicionar evidência
      if (evidencia && evidencia.url) {
        if (!parlamentar.evidencias) {
          parlamentar.evidencias = [];
        }
        
        const novaEvidencia = {
          ...evidencia,
          pauta_slug: pauta_slug || 'geral',
          contribuido_por: usuario_nome,
          data: new Date().toISOString()
        };

        const existe = parlamentar.evidencias.some(e => e.url === evidencia.url);
        if (!existe) {
          parlamentar.evidencias.push(novaEvidencia);
        }
      }

      // Salvar arquivo atualizado na nova branch
      const newContent = JSON.stringify(congressistas, null, 2);

      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: 'api/congressistas-dados.json',
        message: `Contribuição de dados: ${parlamentar_nome}`,
        content: Buffer.from(newContent).toString('base64'),
        branch: branchName,
        sha: fileSha
      });

      console.log('✅ Arquivo atualizado na branch');

      // Criar Pull Request
      const prBody = `## 📊 Contribuição de Dados
      
**Parlamentar:** ${parlamentar_nome} (ID: ${parlamentar_id})
**Pauta:** \`${pauta_slug || 'N/A'}\`
**Contribuído por:** ${usuario_nome} (${usuario_email})

### Dados Enviados:
${dados_contato?.whatsapp ? `- 📱 WhatsApp: \`${dados_contato.whatsapp}\`\n` : ''}${dados_contato?.instagram ? `- 📷 Instagram: \`${dados_contato.instagram}\`\n` : ''}${dados_contato?.assessores ? `- 👥 Assessores: ${dados_contato.assessores.length}\n` : ''}${evidencia ? `- 📄 Evidência: [${evidencia.tipo}](${evidencia.url})\n` : ''}

---
_Esta contribuição foi enviada pela comunidade e precisa ser revisada._`;

      const { data: pr } = await octokit.rest.pulls.create({
        owner,
        repo,
        title: `[CONTRIBUIÇÃO] Dados de ${parlamentar_nome}`,
        head: branchName,
        base: branch,
        body: prBody
      });

      // Adicionar labels
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: pr.number,
        labels: ['contribuição', 'dados-parlamentar', 'aguardando-revisão']
      });

      console.log(`✅ Pull Request criado: #${pr.number}`);

      return res.status(200).json({
        success: true,
        message: 'Contribuição enviada com sucesso! Será revisada em breve.',
        pr_number: pr.number,
        pr_url: pr.html_url
      });

    } catch (error) {
      console.error('❌ Erro ao processar contribuição:', error);
      
      return res.status(500).json({
        success: false,
        error: 'Erro ao processar contribuição',
        details: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Método não permitido' });
}
