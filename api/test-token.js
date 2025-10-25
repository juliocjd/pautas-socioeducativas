// api/test-token.js
// API temporária para testar se GITHUB_TOKEN está funcionando

const { Octokit } = require('@octokit/rest');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const token = process.env.GITHUB_TOKEN;
    
    if (!token) {
      return res.status(200).json({
        success: false,
        error: 'GITHUB_TOKEN não está configurado',
        message: 'Adicione a variável GITHUB_TOKEN no Vercel'
      });
    }

    // Testar token
    const octokit = new Octokit({ auth: token });
    
    try {
      // Tentar buscar informações do usuário autenticado
      const { data: user } = await octokit.rest.users.getAuthenticated();
      
      // Tentar listar repositórios
      const { data: repos } = await octokit.rest.repos.listForAuthenticatedUser({
        per_page: 5
      });
      
      // Tentar acessar o repositório específico
      const { data: repo } = await octokit.rest.repos.get({
        owner: 'juliocjd',
        repo: 'pautas-socioeducativas'
      });
      
      return res.status(200).json({
        success: true,
        message: '✅ GITHUB_TOKEN está funcionando perfeitamente!',
        details: {
          usuario_autenticado: user.login,
          nome: user.name,
          permissoes_token: user.permissions || 'N/A',
          repositorio_acessivel: repo.name,
          repositorio_owner: repo.owner.login,
          tem_permissao_escrita: repo.permissions?.push || false,
          tem_permissao_admin: repo.permissions?.admin || false,
          rate_limit_info: '✅ Token válido e com rate limit'
        },
        proximos_passos: [
          '✅ Token funcionando',
          '✅ Acesso ao repositório confirmado',
          'Agora as APIs devem funcionar!',
          'Teste: curl https://seu-site.vercel.app/api/pautas'
        ]
      });
      
    } catch (apiError) {
      // Erro ao usar o token
      if (apiError.status === 401) {
        return res.status(200).json({
          success: false,
          error: 'Token inválido ou expirado',
          message: 'O GITHUB_TOKEN no Vercel não está funcionando',
          detalhes: apiError.message,
          solucao: [
            '1. Gere um novo token: https://github.com/settings/tokens',
            '2. Selecione scope: repo',
            '3. Copie o token gerado',
            '4. Atualize GITHUB_TOKEN no Vercel',
            '5. Redeploy'
          ]
        });
      }
      
      if (apiError.status === 403) {
        return res.status(200).json({
          success: false,
          error: 'Token sem permissões suficientes',
          message: 'O token precisa de permissão "repo"',
          detalhes: apiError.message,
          solucao: [
            '1. Acesse: https://github.com/settings/tokens',
            '2. Clique no token existente',
            '3. Marque: ✅ repo (Full control)',
            '4. Update token',
            'Ou gere um novo token com a permissão correta'
          ]
        });
      }
      
      if (apiError.status === 404) {
        return res.status(200).json({
          success: false,
          error: 'Repositório não encontrado',
          message: 'Token funciona mas não tem acesso ao repositório',
          detalhes: apiError.message,
          solucao: [
            'Verifique se o token tem acesso ao repositório juliocjd/pautas-socioeducativas',
            'Se o repo for privado, o token precisa de permissão repo completa'
          ]
        });
      }
      
      throw apiError; // Re-throw outros erros
    }
    
  } catch (error) {
    return res.status(200).json({
      success: false,
      error: 'Erro inesperado',
      message: error.message,
      stack: error.stack,
      solucao: 'Verifique os logs do Vercel para mais detalhes'
    });
  }
};
