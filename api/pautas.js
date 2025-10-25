// api/pautas.js
// Gerenciamento de pautas via GitHub API

const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Personal Access Token
const REPO_OWNER = 'juliocjd';
const REPO_NAME = 'pautas-socioeducativas';
const PAUTAS_PATH = '_pautas';

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
    // Listar todas as pautas
    if (req.method === 'GET') {
      const pautas = await listPautas();
      return res.status(200).json({ pautas });
    }

    // Criar nova pauta
    if (req.method === 'POST') {
      const { filename, content } = req.body;
      if (!filename || !content) {
        return res.status(400).json({ error: 'Filename e content são obrigatórios' });
      }
      
      const result = await createPauta(filename, content);
      return res.status(201).json(result);
    }

    // Atualizar pauta existente
    if (req.method === 'PUT') {
      const { filename, content } = req.body;
      if (!filename || !content) {
        return res.status(400).json({ error: 'Filename e content são obrigatórios' });
      }
      
      const result = await updatePauta(filename, content);
      return res.status(200).json(result);
    }

    // Deletar pauta
    if (req.method === 'DELETE') {
      const { filename } = req.body;
      if (!filename) {
        return res.status(400).json({ error: 'Filename é obrigatório' });
      }
      
      const result = await deletePauta(filename);
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: 'Método não permitido' });

  } catch (error) {
    console.error('Erro:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Listar todas as pautas
function listPautas() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${PAUTAS_PATH}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Pautas-Admin',
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    const req = https.request(options, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          cons
