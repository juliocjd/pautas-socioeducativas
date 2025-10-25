// api/contribuicoes-pendentes.js
// Lista PRs abertos com contribuições pendentes de aprovação

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // GET - Listar PRs abertos
    if (req.method === 'GET') {
      const { data: pulls } = await octokit.rest.pulls.list({
        ...REPO,
        state: 'open',
        per_page: 100
      });

      const contribuicoes = [];

      for (const pr of pulls) {
        // Verificar se tem label de contribuição
        const hasContribLabel = pr.labels.some(label => 
          label.name === 'contribuição' || label.name === 'contribution'
        );

        if (!hasContribLabel) continue;

        try {
          // Buscar arquivos alterados no PR
          const { data: files } = await octokit.rest.pulls.listFiles({
            ...REPO,
            pull_number: pr.number
          });

          // Parse da descrição do PR para extrair dados
          const body = pr.body || '';
          
          // Extrair dados estruturados (esperamos JSON no body)
          let dadosContribuicao = null;
          const jsonMatch = body.match(/```json\n([\s\S]*?)\n```/);
          if (jsonMatch) {
            try {
              dadosContribuicao = JSON.parse(jsonMatch[1]);
            } catch (e) {
              console.error('Erro ao parsear JSON do PR:', e);
            }
          }

          contribuicoes.push({
            pr_number: pr.number,
            pr_url: pr.html_url,
            titulo: pr.title,
            usuario_nome: dadosContribuicao?.usuario_nome || pr.user.login,
            usuario_email: dadosContribuicao?.usuario_email || '',
            parlamentar_id: dadosContribuicao?.parlamentar_id || '',
            parlamentar_nome: dadosContribuicao?.parlamentar_nome || '',
            pauta_slug: dadosContribuicao?.pauta_slug || '',
            dados_contato: dadosContribuicao?.dados_contato || null,
            evidencia: dadosContribuicao?.evidencia || null,
            criado_em: pr.created_at,
            arquivos_alterados: files.map(f => f.filename)
          });
        } catch (error) {
          console.error(`Erro ao processar PR #${pr.number}:`, error.message);
        }
      }

      return res.status(200).json({ 
        success: true, 
        contribuicoes 
      });
    }

    // POST - Aprovar contribuição
    if (req.method === 'POST') {
      const { pr_number, dados_aprovados } = req.body;

      if (!pr_number) {
        return res.status(400).json({ success: false, error: 'pr_number é obrigatório' });
      }

      // Verificar autenticação
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Não autorizado' });
      }

      // TODO: Aplicar as mudanças aprovadas
      // 1. Merge do PR ou aplicação seletiva das mudanças
      // 2. Atualizar arquivos _data/congressistas_extras.yml
      // 3. Atualizar _data/evidencias_pautas.yml

      // Por enquanto, apenas comentar no PR
      await octokit.rest.issues.createComment({
        ...REPO,
        issue_number: pr_number,
        body: `✅ Contribuição aprovada pelo administrador!\n\nDados aprovados:\n\`\`\`json\n${JSON.stringify(dados_aprovados, null, 2)}\n\`\`\``
      });

      return res.status(200).json({ 
        success: true, 
        message: 'Comentário adicionado ao PR. Faça o merge manualmente.' 
      });
    }

    return res.status(405).json({ success: false, message: 'Método não permitido' });

  } catch (error) {
    console.error('Erro na API /api/contribuicoes-pendentes:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
