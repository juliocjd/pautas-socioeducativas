// API para listar contribuições pendentes do arquivo YAML
import { Octokit } from '@octokit/rest';
import yaml from 'js-yaml';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Desabilitar cache COMPLETAMENTE
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN
      });

      const owner = process.env.GITHUB_OWNER || 'juliocjd';
      const repo = process.env.GITHUB_REPO || 'pautas-socioeducativas';
      const branch = 'main';
      const filePath = '_data/contribuicoes_pendentes.yml';

      console.log('📥 Buscando contribuições pendentes do arquivo YAML...');

      try {
        // Buscar arquivo - adicionar timestamp para evitar cache do GitHub
        const timestamp = Date.now();
        const { data: fileData } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: filePath,
          ref: branch,
          headers: {
            'Cache-Control': 'no-cache'
          }
        });

        // Decodificar conteúdo
        const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
        const contribuicoes = yaml.load(content) || [];

        console.log(`✅ ${contribuicoes.length} contribuições encontradas no arquivo`);

        // Filtrar apenas pendentes
        const pendentes = contribuicoes.filter(c => c.status === 'pendente');

        console.log(`📋 ${pendentes.length} contribuições pendentes`);

        return res.status(200).json({
          success: true,
          contribuicoes: pendentes,
          total: pendentes.length,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        if (error.status === 404) {
          // Arquivo não existe ainda
          console.log('ℹ️ Arquivo de contribuições não existe ainda');
          return res.status(200).json({
            success: true,
            contribuicoes: [],
            total: 0,
            timestamp: new Date().toISOString()
          });
        }
        throw error;
      }

    } catch (error) {
      console.error('❌ Erro ao buscar contribuições:', error);
      
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar contribuições',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Método não permitido
  return res.status(405).json({ error: 'Método não permitido' });
}
