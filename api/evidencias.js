// api/evidencias.js
// CRUD para evidências de posicionamento (específicas por pauta)
// CORRIGIDO PARA ACEITAR BATCH UPDATES DO EDITOR DE PLENÁRIO

const { Octokit } = require("@octokit/rest"); // <-- MUDANÇA: Usar Octokit
const yaml = require("js-yaml");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "juliocjd";
const REPO_NAME = "pautas-socioeducativas";
const FILE_PATH = "_data/evidencias_pautas.yml";

const octokit = new Octokit({ auth: GITHUB_TOKEN }); // <-- MUDANÇA: Instanciar Octokit

const REPO = {
  owner: REPO_OWNER,
  repo: REPO_NAME,
};

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: "GitHub Token não configurado" });
  }

  // --- CORREÇÃO (BUG 4): Validar Autenticação para POST/DELETE ---
  if (req.method === "POST" || req.method === "DELETE") {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "Não autorizado" });
    }
  }
  // --- FIM DA CORREÇÃO ---

  try {
    // GET - Listar evidências (opcionalmente filtradas por pauta)
    if (req.method === "GET") {
      const { pauta_slug } = req.query;
      const data = await getEvidenciasData();

      if (pauta_slug && data.pautas && data.pautas[pauta_slug]) {
        return res.status(200).json({ evidencias: data.pautas[pauta_slug] });
      }

      return res.status(200).json({ pautas: data.pautas || {} });
    }

    // POST - Adicionar evidência OU Batch Update de Posições
    if (req.method === "POST") {
      // --- INÍCIO DA CORREÇÃO (BUG 4) ---
      // Rota 1: Batch update vindo do "Editor de Plenário"
      const { pauta_slug, changes } = req.body;
      if (pauta_slug && changes && typeof changes === "object") {
        console.log(`Iniciando batch update para pauta: ${pauta_slug}`);
        const result = await batchUpdatePosicoes(pauta_slug, changes);
        return res.status(200).json(result);
      }

      // Rota 2: Adição de evidência individual (lógica original)
      const { parlamentar_id, posicao, evidencia } = req.body;
      if (pauta_slug && parlamentar_id) {
        console.log(`Iniciando adição de evidência para: ${parlamentar_id}`);
        const result = await addEvidencia(
          pauta_slug,
          parlamentar_id,
          posicao,
          evidencia
        );
        return res.status(200).json(result);
      }
      // --- FIM DA CORREÇÃO ---

      return res
        .status(400)
        .json({
          error:
            "Payload inválido. Envie {pauta_slug, changes} ou {pauta_slug, parlamentar_id, ...}",
        });
    }

    // DELETE - Remover evidência
    if (req.method === "DELETE") {
      const { pauta_slug, parlamentar_id } = req.body;

      if (!pauta_slug || !parlamentar_id) {
        return res
          .status(400)
          .json({ error: "pauta_slug e parlamentar_id são obrigatórios" });
      }

      const result = await deleteEvidencia(pauta_slug, parlamentar_id);
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: "Método não permitido" });
  } catch (error) {
    console.error("Erro na API /api/evidencias:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// --- FUNÇÕES AUXILIARES ---

// (getEvidenciasData, addEvidencia, deleteEvidencia)
// As funções auxiliares usam 'githubRequest' que não está neste arquivo.
// Vamos reescrevê-las para usar Octokit, igual ao 'api/pautas.js'

// Buscar dados atuais
async function getEvidenciasData() {
  try {
    const { data: fileData } = await octokit.rest.repos.getContent({
      ...REPO,
      path: FILE_PATH,
    });
    const content = Buffer.from(fileData.content, "base64").toString("utf8");
    return {
      data: yaml.load(content) || { pautas: {} },
      sha: fileData.sha,
    };
  } catch (error) {
    if (error.status === 404 || error.message.includes("Not Found")) {
      return { data: { pautas: {} }, sha: null }; // Arquivo não existe
    }
    throw error;
  }
}

// Salvar dados no GitHub
async function saveEvidenciasData(data, sha, commitMessage) {
  const yamlContent = yaml.dump(data, { indent: 2, lineWidth: -1 });

  const params = {
    ...REPO,
    path: FILE_PATH,
    message: commitMessage,
    content: Buffer.from(yamlContent).toString("base64"),
  };

  if (sha) {
    params.sha = sha; // Atualiza arquivo existente
  }

  await octokit.rest.repos.createOrUpdateFileContents(params);
}

// --- NOVAS FUNÇÕES DE LÓGICA ---

// Lógica de Adição Individual (Refatorada)
async function addEvidencia(pauta_slug, parlamentar_id, posicao, evidencia) {
  const { data, sha } = await getEvidenciasData();

  if (!data.pautas) data.pautas = {};
  if (!data.pautas[pauta_slug]) data.pautas[pauta_slug] = {};
  if (!data.pautas[pauta_slug][parlamentar_id]) {
    data.pautas[pauta_slug][parlamentar_id] = {
      posicao: "nao-manifestado",
      evidencias: [],
    };
  }

  // Adicionar evidência se fornecida
  if (evidencia && evidencia.url) {
    if (!data.pautas[pauta_slug][parlamentar_id].evidencias) {
      data.pautas[pauta_slug][parlamentar_id].evidencias = [];
    }
    data.pautas[pauta_slug][parlamentar_id].evidencias.push({
      tipo: evidencia.tipo || "link",
      url: evidencia.url,
      data: new Date().toISOString().split("T")[0],
      descricao: evidencia.descricao || "",
    });
  }

  // Atualizar posição se fornecida
  if (posicao) {
    data.pautas[pauta_slug][parlamentar_id].posicao = posicao;
  }

  // Salvar
  await saveEvidenciasData(
    data,
    sha,
    `Adicionar evidência - ${pauta_slug} - ${parlamentar_id}`
  );

  return { success: true, message: "Evidência adicionada com sucesso" };
}

// Lógica de Remoção (Refatorada)
async function deleteEvidencia(pauta_slug, parlamentar_id) {
  const { data, sha } = await getEvidenciasData();

  if (
    !data.pautas ||
    !data.pautas[pauta_slug] ||
    !data.pautas[pauta_slug][parlamentar_id]
  ) {
    return { success: false, message: "Evidência não encontrada" };
  }
  if (!sha) {
    return {
      success: false,
      message: "Arquivo de evidências não existe, nada para deletar",
    };
  }

  delete data.pautas[pauta_slug][parlamentar_id];

  if (Object.keys(data.pautas[pauta_slug]).length === 0) {
    delete data.pautas[pauta_slug];
  }

  await saveEvidenciasData(
    data,
    sha,
    `Remover evidência - ${pauta_slug} - ${parlamentar_id}`
  );

  return { success: true, message: "Evidência removida com sucesso" };
}

// --- FUNÇÃO DE CORREÇÃO (BUG 4) ---
// Nova função para Batch Update
async function batchUpdatePosicoes(pauta_slug, changes) {
  const { data, sha } = await getEvidenciasData();

  if (!data.pautas) data.pautas = {};
  if (!data.pautas[pauta_slug]) data.pautas[pauta_slug] = {};

  let changesCount = 0;
  // Loop sobre o objeto 'changes' vindo do frontend
  for (const parlamentar_id in changes) {
    const novaPosicao = changes[parlamentar_id];

    // Garantir que o objeto do parlamentar existe
    if (!data.pautas[pauta_slug][parlamentar_id]) {
      data.pautas[pauta_slug][parlamentar_id] = {
        posicao: "nao-manifestado",
        evidencias: [],
      };
    }

    // Atualizar a posição
    data.pautas[pauta_slug][parlamentar_id].posicao = novaPosicao;
    changesCount++;
  }

  if (changesCount === 0) {
    return { success: true, message: "Nenhuma alteração para salvar" };
  }

  // Salvar o arquivo YAML inteiro de uma vez
  await saveEvidenciasData(
    data,
    sha,
    `Batch update de ${changesCount} posições para pauta ${pauta_slug}`
  );

  return {
    success: true,
    message: `${changesCount} posições atualizadas com sucesso para ${pauta_slug}`,
  };
}
