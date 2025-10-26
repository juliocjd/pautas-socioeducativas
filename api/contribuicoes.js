// API para receber contribuições da sociedade
import { Octokit } from '@octokit/rest';
import yaml from 'js-yaml';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const { pauta_slug, pauta_title, nome, email, tipo, conteudo } = req.body;

      // Validação
      if (!pauta_slug || !nome || !email || !tipo || !conteudo) {
        return res.status(400).json({ 
          error: 'Todos os campos são obrigatórios',
          campos_obrigatorios: ['pauta_slug', 'nome', 'email', 'tipo', 'conteudo']
        });
      }

      // Validar email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Email inválido' });
      }

      // Validar tipo
      const tiposValidos = ['sugestao', 'correcao', 'apoio', 'outro'];
      if (!tiposValidos.includes(tipo)) {
        return res.status(400).json({ 
          error: 'Tipo inválido',
          tipos_validos: tiposValidos
        });
      }

      const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN
      });

      const owner = process.env.GITHUB_OWNER || 'juliocjd';
      const repo = process.env.GITHUB_REPO || 'pautas-socioeducativas';
      const branch = 'main';
      const filePath = '_data/contribuicoes_pendentes.yml';

      console.log('📝 Nova contribuição recebida:', { pauta_slug, nome, tipo });

      // Buscar arquivo atual ou criar novo
      let fileContent = [];
      let fileSha = null;

      try {
        const { data: fileData } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: filePath,
          ref: branch
        });

        fileSha = fileData.sha;
        const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
        fileContent = yaml.load(content) || [];
        
        console.log(`✅ Arquivo existente encontrado com ${fileContent.length} contribuições`);
      } catch (error) {
        if (error.status === 404) {
          console.log('ℹ️ Arquivo não existe, será criado');
          fileContent = [];
        } else {
          throw error;
        }
      }

      // Nova contribuição
      const novaContribuicao = {
        id: Date.now().toString(),
        pauta_slug,
        pauta_title: pauta_title || pauta_slug,
        nome,
        email,
        tipo,
        conteudo,
        data: new Date().toISOString(),
        status: 'pendente'
      };

      // Adicionar no início do array
      fileContent.unshift(novaContribuicao);

      console.log('💾 Salvando contribuição...');

      // Converter para YAML
      const newContent = yaml.dump(fileContent, { 
        indent: 2,
        lineWidth: -1,
        noRefs: true
      });

      // Salvar no GitHub
      const commitMessage = `Nova contribuição de ${nome} para pauta "${pauta_title || pauta_slug}"`;

      if (fileSha) {
        // Atualizar arquivo existente
        await octokit.rest.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: filePath,
          message: commitMessage,
          content: Buffer.from(newContent).toString('base64'),
          branch,
          sha: fileSha
        });
      } else {
        // Criar novo arquivo
        await octokit.rest.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: filePath,
          message: commitMessage,
          content: Buffer.from(newContent).toString('base64'),
          branch
        });
      }

      console.log('✅ Contribuição salva com sucesso!');

      return res.status(200).json({
        success: true,
        message: 'Contribuição enviada com sucesso! Será analisada em breve.',
        contribuicao: {
          id: novaContribuicao.id,
          pauta: pauta_title || pauta_slug,
          tipo
        }
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

  // Método não permitido
  return res.status(405).json({ error: 'Método não permitido' });
}
