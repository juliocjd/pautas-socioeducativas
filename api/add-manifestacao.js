const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const novaManifestacao = req.body;

        // Carregar dados dos parlamentares
        const parlamentaresPath = path.join(process.cwd(), 'parlamentares_cache.json');
        const parlamentaresData = await fs.readFile(parlamentaresPath, 'utf8');
        const parlamentares = JSON.parse(parlamentaresData);

        // Encontrar o parlamentar para adicionar partido e UF
        const parlamentarInfo = parlamentares.find(p => p.nome.toLowerCase() === novaManifestacao.parlamentar.toLowerCase());

        if (parlamentarInfo) {
            novaManifestacao.partido = parlamentarInfo.partido;
            novaManifestacao.uf = parlamentarInfo.uf;
        } else {
            // O que fazer se não encontrar? Por enquanto, deixamos em branco.
            novaManifestacao.partido = '';
            novaManifestacao.uf = '';
        }
        
        novaManifestacao.data = new Date().toLocaleDateString('pt-BR');

        // Carregar, atualizar e salvar o arquivo YAML de manifestações
        const manifestacoesPath = path.join(process.cwd(), '_data', 'manifestacoes.yml');
        const manifestacoesFile = await fs.readFile(manifestacoesPath, 'utf8');
        const manifestacoes = yaml.load(manifestacoesFile) || [];

        manifestacoes.unshift(novaManifestacao); // Adiciona no início da lista

        await fs.writeFile(manifestacoesPath, yaml.dump(manifestacoes));

        res.status(200).json({ message: 'Manifestação adicionada com sucesso!' });

    } catch (error) {
        console.error('Erro ao adicionar manifestação:', error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
};