// API para gerenciar contribuições pendentes
// Suporta: listagem, aprovação parcial, aprovação total, rejeição
import { Octokit } from '@octokit/rest';
import yaml from 'js-yaml';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Desabilitar cache
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
  });

  const owner = process.env.GITHUB_OWNER || 'juliocjd';
  const repo = process.env.GITHUB_REPO || 'pautas-socioeducativas';
  const branch = 'main';

  // ==========================================
  // GET - LISTAR CONTRIBUIÇÕES PENDENTES
  // ==========================================
  if (req.method === 'GET') {
    try {
      console.log('📥 Buscando contribuições pendentes...');

      // 1. Buscar contribuições de CONTEÚDO (arquivo YAML)
      let contribuicoesConteudo = [];
      try {
        const { data: fileData } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: '_data/contribuicoes_pendentes.yml',
          ref: branch
        });

        const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
        const dados = yaml.load(content) || [];
        contribuicoesConteudo = dados.filter(c => c.status === 'pendente');
        
        console.log(`✅ ${contribuicoesConteudo.length} contribuições de conteúdo encontradas`);
      } catch (error) {
        if (error.status !== 404) {
          console.error('⚠️ Erro ao buscar contribuições de conteúdo:', error.message);
        }
      }

      // 2. Buscar contribuições de DADOS (Pull Requests)
      let contribuicoesDados = [];
      try {
        const { data: pulls } = await octokit.rest.pulls.list({
          owner,
          repo,
          state: 'open',
          base: branch
        });

        // Filtrar apenas PRs de contribuição de dados
        const prsContribuicao = pulls.filter(pr => 
          pr.title.includes('[CONTRIBUIÇÃO]') || 
          pr.labels.some(l => l.name === 'contribuição')
        );

        for (const pr of prsContribuicao) {
          try {
            // Buscar arquivos do PR
            const { data: files } = await octokit.rest.pulls.listFiles({
              owner,
              repo,
              pull_number: pr.number
            });

            // Verificar se modifica congressistas.json
            const congressistasFile = files.find(f => f.filename === 'api/congressistas.json');
            
            if (congressistasFile && congressistasFile.patch) {
              // Extrair dados do patch
              const dadosExtraidos = extrairDadosDoPatch(congressistasFile.patch);
              
              contribuicoesDados.push({
                pr_number: pr.number,
                pr_url: pr.html_url,
                parlamentar_id: dadosExtraidos.id,
                parlamentar_nome: dadosExtraidos.nome,
                pauta_slug: extrairPautaDoPR(pr),
                usuario_nome: pr.user.login,
                criado_em: pr.created_at,
                dados_contato: dadosExtraidos.dados_contato,
                evidencia: dadosExtraidos.evidencia
              });
            }
          } catch (error) {
            console.error(`⚠️ Erro ao processar PR #${pr.number}:`, error.message);
          }
        }

        console.log(`✅ ${contribuicoesDados.length} contribuições de dados encontradas`);
      } catch (error) {
        console.error('⚠️ Erro ao buscar PRs:', error.message);
      }

      // 3. Combinar e retornar
      const todasContribuicoes = [...contribuicoesDados, ...contribuicoesConteudo];

      return res.status(200).json({
        success: true,
        contribuicoes: todasContribuicoes,
        total: todasContribuicoes.length,
        tipo_dados: contribuicoesDados.length,
        tipo_conteudo: contribuicoesConteudo.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Erro ao listar contribuições:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao listar contribuições',
        details: error.message
      });
    }
  }

  // ==========================================
  // POST - APROVAR OU REJEITAR CONTRIBUIÇÕES
  // ==========================================
  if (req.method === 'POST') {
    try {
      const { action, pr_number, parlamentar_id, itens, id } = req.body;

      // Validar autenticação
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Não autorizado' });
      }

      const token = authHeader.split(' ')[1];
      // Validar token (simplificado - você pode melhorar isso)
      if (!token) {
        return res.status(401).json({ error: 'Token inválido' });
      }

      console.log(`📝 Ação: ${action} | PR: ${pr_number} | Parlamentar: ${parlamentar_id}`);

      // ==========================================
      // APROVAR ITENS SELECIONADOS (PARCIAL)
      // ==========================================
      if (action === 'approve_partial' && pr_number && parlamentar_id && itens) {
        console.log('✅ Aprovando itens selecionados...');

        // 1. Buscar arquivo atual de congressistas
        let congressistas = {};
        try {
          const { data: fileData } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: 'api/congressistas.json',
            ref: branch
          });

          const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
          congressistas = JSON.parse(content);
        } catch (error) {
          if (error.status === 404) {
            congressistas = {};
          } else {
            throw error;
          }
        }

        // 2. Atualizar dados do parlamentar
        if (!congressistas[parlamentar_id]) {
          congressistas[parlamentar_id] = {};
        }

        const parlamentar = congressistas[parlamentar_id];

        // WhatsApp (pode ter múltiplos)
        if (itens.whatsapp) {
          if (!parlamentar.whatsapp) {
            parlamentar.whatsapp = [];
          }
          if (!Array.isArray(parlamentar.whatsapp)) {
            parlamentar.whatsapp = [parlamentar.whatsapp];
          }
          if (!parlamentar.whatsapp.includes(itens.whatsapp)) {
            parlamentar.whatsapp.push(itens.whatsapp);
          }
        }

        // Instagram (substitui)
        if (itens.instagram) {
          parlamentar.instagram = itens.instagram;
        }

        // Telefone gabinete (substitui)
        if (itens.telefone_gabinete) {
          parlamentar.telefone_gabinete = itens.telefone_gabinete;
        }

        // Assessores (adiciona à lista)
        if (itens.assessores && itens.assessores.length > 0) {
          if (!parlamentar.assessores) {
            parlamentar.assessores = [];
          }
          itens.assessores.forEach(novoAss => {
            // Verificar se já existe (por WhatsApp)
            const existe = parlamentar.assessores.some(a => a.whatsapp === novoAss.whatsapp);
            if (!existe) {
              parlamentar.assessores.push(novoAss);
            }
          });
        }

        // Evidências (adiciona à lista)
        if (itens.evidencias && itens.evidencias.length > 0) {
          if (!parlamentar.evidencias) {
            parlamentar.evidencias = [];
          }
          itens.evidencias.forEach(novaEv => {
            // Verificar se já existe (por URL)
            const existe = parlamentar.evidencias.some(e => e.url === novaEv.url);
            if (!existe) {
              parlamentar.evidencias.push(novaEv);
            }
          });
        }

        // 3. Salvar arquivo atualizado
        const { data: currentFile } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: 'api/congressistas.json',
          ref: branch
        });

        await octokit.rest.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: 'api/congressistas.json',
          message: `Aprovar dados de ${parlamentar_id} (parcial) - PR #${pr_number}`,
          content: Buffer.from(JSON.stringify(congressistas, null, 2)).toString('base64'),
          branch,
          sha: currentFile.sha
        });

        // 4. Comentar no PR
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: pr_number,
          body: `✅ **Itens aprovados seletivamente:**\n\n${gerarListaItensAprovados(itens)}\n\n_Aprovado via painel administrativo_`
        });

        // 5. Adicionar label
        await octokit.rest.issues.addLabels({
          owner,
          repo,
          issue_number: pr_number,
          labels: ['parcialmente-aprovado']
        });

        console.log('✅ Itens aprovados e salvos com sucesso!');

        return res.status(200).json({
          success: true,
          message: 'Itens aprovados com sucesso',
          parlamentar_id,
          itens_aprovados: itens
        });
      }

      // ==========================================
      // REJEITAR CONTRIBUIÇÃO (PR)
      // ==========================================
      if (action === 'reject' && pr_number) {
        console.log(`❌ Rejeitando PR #${pr_number}...`);

        // Comentar e fechar PR
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: pr_number,
          body: '❌ **Contribuição rejeitada**\n\nObrigado pela contribuição, mas infelizmente não poderemos aceitar neste momento.\n\n_Rejeitado via painel administrativo_'
        });

        await octokit.rest.pulls.update({
          owner,
          repo,
          pull_number: pr_number,
          state: 'closed'
        });

        console.log('✅ PR fechado com sucesso');

        return res.status(200).json({
          success: true,
          message: 'Contribuição rejeitada'
        });
      }

      // ==========================================
      // REJEITAR CONTRIBUIÇÃO DE CONTEÚDO (YAML)
      // ==========================================
      if (action === 'reject_content' && id) {
        console.log(`❌ Rejeitando contribuição de conteúdo ID: ${id}...`);

        // Buscar arquivo atual
        const { data: fileData } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: '_data/contribuicoes_pendentes.yml',
          ref: branch
        });

        const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
        let contribuicoes = yaml.load(content) || [];

        // Marcar como rejeitada
        contribuicoes = contribuicoes.map(c => 
          c.id === id ? { ...c, status: 'rejeitada', rejeitada_em: new Date().toISOString() } : c
        );

        // Salvar
        const newContent = yaml.dump(contribuicoes, { indent: 2, lineWidth: -1, noRefs: true });

        await octokit.rest.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: '_data/contribuicoes_pendentes.yml',
          message: `Rejeitar contribuição ${id}`,
          content: Buffer.from(newContent).toString('base64'),
          branch,
          sha: fileData.sha
        });

        return res.status(200).json({
          success: true,
          message: 'Contribuição rejeitada'
        });
      }

      return res.status(400).json({ error: 'Ação inválida' });

    } catch (error) {
      console.error('❌ Erro ao processar ação:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao processar ação',
        details: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Método não permitido' });
}

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

function extrairDadosDoPatch(patch) {
  const dados = {
    id: null,
    nome: null,
    dados_contato: {},
    evidencia: null
  };

  try {
    // Extrair linhas adicionadas (+)
    const linhasAdicionadas = patch.split('\n').filter(l => l.startsWith('+'));
    
    for (const linha of linhasAdicionadas) {
      // ID do parlamentar
      if (linha.includes('"') && linha.includes(':')) {
        const match = linha.match(/"([^"]+)":\s*{/);
        if (match) dados.id = match[1];
      }

      // WhatsApp
      if (linha.includes('whatsapp')) {
        const match = linha.match(/"whatsapp":\s*"([^"]+)"/);
        if (match) dados.dados_contato.whatsapp = match[1];
      }

      // Instagram
      if (linha.includes('instagram')) {
        const match = linha.match(/"instagram":\s*"([^"]+)"/);
        if (match) dados.dados_contato.instagram = match[1];
      }

      // Telefone
      if (linha.includes('telefone_gabinete')) {
        const match = linha.match(/"telefone_gabinete":\s*"([^"]+)"/);
        if (match) dados.dados_contato.telefone_gabinete = match[1];
      }

      // Assessores (simplificado)
      if (linha.includes('assessores')) {
        dados.dados_contato.assessores = [];
      }
    }
  } catch (error) {
    console.error('⚠️ Erro ao extrair dados do patch:', error);
  }

  return dados;
}

function extrairPautaDoPR(pr) {
  const match = pr.body?.match(/Pauta:\s*`([^`]+)`/i);
  return match ? match[1] : null;
}

function gerarListaItensAprovados(itens) {
  const lista = [];
  
  if (itens.whatsapp) lista.push(`- ✅ WhatsApp: \`${itens.whatsapp}\``);
  if (itens.instagram) lista.push(`- ✅ Instagram: \`${itens.instagram}\``);
  if (itens.telefone_gabinete) lista.push(`- ✅ Telefone: \`${itens.telefone_gabinete}\``);
  if (itens.assessores?.length > 0) {
    lista.push(`- ✅ ${itens.assessores.length} assessor(es)`);
  }
  if (itens.evidencias?.length > 0) {
    lista.push(`- ✅ ${itens.evidencias.length} evidência(s)`);
  }
  
  return lista.join('\n');
}
