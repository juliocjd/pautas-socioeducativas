// API para gerenciar contribuições pendentes
// Suporta: listagem, aprovação parcial, aprovação total, rejeição
import { Octokit } from "@octokit/rest";
import yaml from "js-yaml";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Desabilitar cache
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  const owner = process.env.GITHUB_OWNER || "juliocjd";
  const repo = process.env.GITHUB_REPO || "pautas-socioeducativas";
  const branch = "main";

  // ==========================================
  // GET - LISTAR CONTRIBUIÇÕES PENDENTES
  // ==========================================
  if (req.method === "GET") {
    try {
      console.log("📥 Buscando contribuições pendentes...");

      // 1. Buscar contribuições de CONTEÚDO (arquivo JSON)
      let contribuicoesConteudo = [];
      try {
        const { data: fileData } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: "_data/contribuicoes_pendentes.yml",
          ref: branch,
        });

        const content = Buffer.from(fileData.content, "base64").toString(
          "utf-8"
        );
        const dados = JSON.parse(content) || [];
        contribuicoesConteudo = dados.filter((c) => c.status === "pendente");

        console.log(
          `✅ ${contribuicoesConteudo.length} contribuições de conteúdo encontradas`
        );
      } catch (error) {
        if (error.status !== 404) {
          console.error(
            "⚠️ Erro ao buscar contribuições de conteúdo:",
            error.message
          );
        }
      }

      // 2. Buscar contribuições de DADOS (Pull Requests)
      let contribuicoesDados = [];
      try {
        const { data: pulls } = await octokit.rest.pulls.list({
          owner,
          repo,
          state: "open",
          base: branch,
        });

        // Filtrar apenas PRs de contribuição de dados
        const prsContribuicao = pulls.filter(
          (pr) =>
            pr.title.includes("[CONTRIBUIÇÃO]") ||
            pr.labels.some((l) => l.name === "contribuição")
        );

        for (const pr of prsContribuicao) {
          try {
            console.log(`📋 Processando PR #${pr.number}: ${pr.title}`);

            // Buscar arquivos modificados no PR
            const { data: files } = await octokit.rest.pulls.listFiles({
              owner,
              repo,
              pull_number: pr.number,
            });

            // Verificar se modifica congressistas.json
            const congressistasFile = files.find(
              (f) => f.filename === "_data/congressistas_extras.json"
            );

            if (!congressistasFile) {
              console.log(
                `⚠️ PR #${pr.number} não modifica congressistas.json`
              );
              continue;
            }

            console.log(`✅ PR #${pr.number} modifica congressistas.json`);

            // BUSCAR ARQUIVO COMPLETO DA BRANCH DO PR (não parsear patch!)
            let dadosExtraidos = {
              id: null,
              nome: null,
              dados_contato: {},
              evidencia: null,
            };

            try {
              // Buscar conteúdo do arquivo da branch do PR
              const { data: fileContent } = await octokit.rest.repos.getContent(
                {
                  owner,
                  repo,
                  path: "_data/congressistas_extras.json",
                  ref: pr.head.ref, // Branch do PR (não main!)
                }
              );

              const content = Buffer.from(
                fileContent.content,
                "base64"
              ).toString("utf-8");
              const congressistas = JSON.parse(content);

              console.log(
                `📊 Congressistas no PR:`,
                Object.keys(congressistas)
              );

              // Encontrar qual parlamentar foi modificado
              // (comparar com main ou pegar o primeiro/último)
              const parlamentarIds = Object.keys(congressistas);

              if (parlamentarIds.length > 0) {
                // Assumir que é o último adicionado/modificado
                // (pode melhorar comparando com main)
                const parlamentarId = parlamentarIds[parlamentarIds.length - 1];
                const parlamentar = congressistas[parlamentarId];

                dadosExtraidos = {
                  id: parlamentarId,
                  nome: extrairNomeDoPR(pr),
                  dados_contato: {
                    whatsapp: parlamentar.whatsapp,
                    instagram: parlamentar.instagram,
                    telefone_gabinete: parlamentar.telefone_gabinete,
                    assessores: parlamentar.assessores,
                  },
                  evidencia: parlamentar.evidencias
                    ? parlamentar.evidencias[parlamentar.evidencias.length - 1]
                    : null,
                };

                console.log(`✅ Dados extraídos do arquivo:`, dadosExtraidos);
              }
            } catch (error) {
              console.error(
                `❌ Erro ao buscar arquivo do PR #${pr.number}:`,
                error.message
              );

              // Fallback: tentar extrair do patch
              console.log("⚠️ Usando fallback: extrair do patch");
              dadosExtraidos = extrairDadosDoPatch(congressistasFile.patch);
            }

            // Adicionar à lista de contribuições
            contribuicoesDados.push({
              pr_number: pr.number,
              pr_url: pr.html_url,
              parlamentar_id: dadosExtraidos.id,
              parlamentar_nome: dadosExtraidos.nome,
              pauta_slug: extrairPautaDoPR(pr),
              usuario_nome: pr.user.login,
              criado_em: pr.created_at,
              dados_contato: dadosExtraidos.dados_contato,
              evidencia: dadosExtraidos.evidencia,
            });

            console.log(
              `✅ Contribuição adicionada: ${
                dadosExtraidos.nome || dadosExtraidos.id
              }`
            );
          } catch (error) {
            console.error(
              `❌ Erro ao processar PR #${pr.number}:`,
              error.message
            );
          }
        }

        console.log(
          `✅ ${contribuicoesDados.length} contribuições de dados encontradas`
        );
      } catch (error) {
        console.error("⚠️ Erro ao buscar PRs:", error.message);
      }

      // 3. Combinar e retornar
      const todasContribuicoes = [
        ...contribuicoesDados,
        ...contribuicoesConteudo,
      ];

      return res.status(200).json({
        success: true,
        contribuicoes: todasContribuicoes,
        total: todasContribuicoes.length,
        tipo_dados: contribuicoesDados.length,
        tipo_conteudo: contribuicoesConteudo.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Erro ao listar contribuições:", error);
      return res.status(500).json({
        success: false,
        error: "Erro ao listar contribuições",
        details: error.message,
      });
    }
  }

  // ==========================================
  // POST - APROVAR OU REJEITAR CONTRIBUIÇÕES
  // ==========================================
  if (req.method === "POST") {
    try {
      const { action, pr_number, parlamentar_id, itens, id } = req.body;

      // Validar autenticação
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Não autorizado" });
      }

      const token = authHeader.split(" ")[1];
      // Validar token (simplificado - você pode melhorar isso)
      if (!token) {
        return res.status(401).json({ error: "Token inválido" });
      }

      console.log(
        `📝 Ação: ${action} | PR: ${pr_number} | Parlamentar: ${parlamentar_id}`
      );

      // ==========================================
      // APROVAR ITENS SELECIONADOS (PARCIAL)
      // ==========================================
      // ==========================================
      // APROVAR ITENS SELECIONADOS (PARCIAL)
      // ==========================================
      if (
        action === "approve_partial" &&
        pr_number &&
        parlamentar_id &&
        itens
      ) {
        console.log("✅ Aprovando itens selecionados... (Corrigido para YAML)");

        // --- INÍCIO DA CORREÇÃO ---
        const FILE_PATH = "_data/congressistas_extras.yml"; // <-- CORREÇÃO: Caminho do YML

        // 1. Buscar arquivo atual de congressistas (YML)
        let congressistasData = { congressistas: {} };
        let fileSha = null;

        try {
          const { data: fileData } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: FILE_PATH, // <-- CORREÇÃO
            ref: branch,
          });

          fileSha = fileData.sha;
          const content = Buffer.from(fileData.content, "base64").toString(
            "utf-8"
          );
          congressistasData = yaml.load(content) || { congressistas: {} }; // <-- CORREÇÃO: Usar yaml.load
          console.log("✅ Arquivo .yml carregado");
        } catch (error) {
          if (error.status === 404) {
            console.log("ℹ️ Arquivo .yml não existe, será criado");
            congressistasData = { congressistas: {} };
            fileSha = null; // Garante que é nulo
          } else {
            throw error; // Lança outros erros
          }
        }

        // 2. Atualizar dados do parlamentar (lógica de merge)
        if (!congressistasData.congressistas) {
          // <-- CORREÇÃO: usa congressistasData
          congressistasData.congressistas = {};
        }
        if (!congressistasData.congressistas[parlamentar_id]) {
          congressistasData.congressistas[parlamentar_id] = {};
        }

        const parlamentar = congressistasData.congressistas[parlamentar_id]; // <-- CORREÇÃO

        // WhatsApp (pode ter múltiplos)
        if (itens.whatsapp) {
          if (!parlamentar.whatsapp) {
            parlamentar.whatsapp = [];
          }
          if (!Array.isArray(parlamentar.whatsapp)) {
            parlamentar.whatsapp = [parlamentar.whatsapp];
          }

          let numeroWhatsApp = itens.whatsapp;
          if (Array.isArray(numeroWhatsApp)) {
            numeroWhatsApp = numeroWhatsApp[0]; // Pegar primeiro elemento
          }

          if (!parlamentar.whatsapp.includes(numeroWhatsApp)) {
            parlamentar.whatsapp.push(numeroWhatsApp);
            console.log(`✅ WhatsApp adicionado: ${numeroWhatsApp}`);
          } else {
            console.log(`ℹ️ WhatsApp já existe: ${numeroWhatsApp}`);
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
          itens.assessores.forEach((novoAss) => {
            const existe = parlamentar.assessores.some(
              (a) => a.whatsapp === novoAss.whatsapp
            );
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
          itens.evidencias.forEach((novaEv) => {
            const existe = parlamentar.evidencias.some(
              (e) => e.url === novaEv.url
            );
            if (!existe) {
              parlamentar.evidencias.push(novaEv);
            }
          });
        }

        // Adicionar data de atualização (importante)
        parlamentar.ultima_atualizacao = new Date().toISOString().split("T")[0];

        // 3. Salvar arquivo atualizado (YML)

        // Converter de volta para YAML
        const newContent = yaml.dump(congressistasData, {
          // <-- CORREÇÃO: yaml.dump
          indent: 2,
          lineWidth: -1,
          noRefs: true,
        });

        const commitData = {
          owner,
          repo,
          path: FILE_PATH, // <-- CORREÇÃO: Caminho do YML
          message: `Aprovar dados de ${parlamentar_id} (parcial) - PR #${pr_number}`,
          content: Buffer.from(newContent).toString("base64"), // <-- CORREÇÃO: newContent é YAML
          branch,
        };

        if (fileSha) {
          commitData.sha = fileSha;
        }

        await octokit.rest.repos.createOrUpdateFileContents(commitData);

        console.log("✅ Arquivo .yml salvo com sucesso");

        // 4. Comentar e Fechar o PR (APENAS APÓS O SUCESSO)
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: pr_number,
          body: `✅ **Itens aprovados seletivamente:**\n\n${gerarListaItensAprovados(
            itens
          )}\n\n_Aprovado via painel administrativo. Os dados foram salvos no \`${FILE_PATH}\`._`,
        });

        await octokit.rest.issues.addLabels({
          owner,
          repo,
          issue_number: pr_number,
          labels: ["parcialmente-aprovado"],
        });

        await octokit.rest.pulls.update({
          owner,
          repo,
          pull_number: pr_number,
          state: "closed",
        });

        console.log("✅ PR fechado e comentado com sucesso!");
        // --- FIM DA CORREÇÃO ---

        return res.status(200).json({
          success: true,
          message: "Itens aprovados com sucesso (salvos no .yml)", // <-- MENSAGEM ATUALIZADA
          parlamentar_id,
          itens_aprovados: itens,
        });
      }

      // ==========================================
      // REJEITAR CONTRIBUIÇÃO (PR)
      // ==========================================
      if (action === "reject" && pr_number) {
        console.log(`❌ Rejeitando PR #${pr_number}...`);

        // Comentar e fechar PR
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: pr_number,
          body: "❌ **Contribuição rejeitada**\n\nObrigado pela contribuição, mas infelizmente não poderemos aceitar neste momento.\n\n_Rejeitado via painel administrativo_",
        });

        await octokit.rest.pulls.update({
          owner,
          repo,
          pull_number: pr_number,
          state: "closed",
        });

        console.log("✅ PR fechado com sucesso");

        return res.status(200).json({
          success: true,
          message: "Contribuição rejeitada",
        });
      }

      if (action === "reject_content" && id) {
        console.log(`❌ Rejeitando contribuição de conteúdo ID: ${id}...`);

        // Buscar arquivo atual
        const { data: fileData } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: "_data/contribuicoes_pendentes.yml",
          ref: branch,
        });

        const content = Buffer.from(fileData.content, "base64").toString(
          "utf-8"
        );
        let contribuicoes = JSON.parse(content) || [];

        // Marcar como rejeitada
        contribuicoes = contribuicoes.map((c) =>
          c.id === id
            ? {
                ...c,
                status: "rejeitada",
                rejeitada_em: new Date().toISOString(),
              }
            : c
        );

        // Salvar
        const newContent = JSON.stringify(contribuicoes, {
          indent: 2,
          lineWidth: -1,
          noRefs: true,
        });

        await octokit.rest.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: "_data/contribuicoes_pendentes.yml",
          message: `Rejeitar contribuição ${id}`,
          content: Buffer.from(newContent).toString("base64"),
          branch,
          sha: fileData.sha,
        });

        return res.status(200).json({
          success: true,
          message: "Contribuição rejeitada",
        });
      }

      return res.status(400).json({ error: "Ação inválida" });
    } catch (error) {
      console.error("❌ Erro ao processar ação:", error);
      return res.status(500).json({
        success: false,
        error: "Erro ao processar ação",
        details: error.message,
      });
    }
  }

  return res.status(405).json({ error: "Método não permitido" });
}

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

function extrairDadosDoPatch(patch) {
  const dados = {
    id: null,
    nome: null,
    dados_contato: {},
    evidencia: null,
  };

  try {
    console.log("🔍 Extraindo dados do patch...");
    console.log("📄 Patch completo:", patch);

    // Extrair linhas adicionadas (+) e removidas (-)
    const linhas = patch.split("\n");
    const linhasAdicionadas = linhas.filter(
      (l) => l.startsWith("+") && !l.startsWith("+++")
    );

    console.log(`📋 ${linhasAdicionadas.length} linhas adicionadas`);

    for (const linha of linhasAdicionadas) {
      // Limpar linha (remover + e espaços)
      const linhaLimpa = linha.substring(1).trim();

      // ID do parlamentar (chave do objeto)
      if (linhaLimpa.match(/^"[^"]+"\s*:\s*{/)) {
        const match = linhaLimpa.match(/^"([^"]+)"\s*:\s*{/);
        if (match) {
          dados.id = match[1];
          console.log("✅ ID encontrado:", dados.id);
        }
      }

      // WhatsApp (pode ser string ou array)
      if (linhaLimpa.includes("whatsapp")) {
        // Formato: "whatsapp": "valor"
        let match = linhaLimpa.match(/"whatsapp"\s*:\s*"([^"]+)"/);
        if (match) {
          dados.dados_contato.whatsapp = match[1];
          console.log("✅ WhatsApp encontrado:", match[1]);
        } else {
          // Formato: "whatsapp": ["valor"]
          match = linhaLimpa.match(/"whatsapp"\s*:\s*\[\s*"([^"]+)"/);
          if (match) {
            dados.dados_contato.whatsapp = match[1];
            console.log("✅ WhatsApp (array) encontrado:", match[1]);
          } else {
            // Formato: linha dentro do array
            match = linhaLimpa.match(/^\s*"([^"]+)"\s*[,\]]?\s*$/);
            if (match && linha.includes("whatsapp")) {
              dados.dados_contato.whatsapp = match[1];
              console.log("✅ WhatsApp (item array) encontrado:", match[1]);
            }
          }
        }
      }

      // Instagram
      if (linhaLimpa.includes("instagram")) {
        const match = linhaLimpa.match(/"instagram"\s*:\s*"([^"]+)"/);
        if (match) {
          dados.dados_contato.instagram = match[1];
          console.log("✅ Instagram encontrado:", match[1]);
        }
      }

      // Telefone gabinete
      if (linhaLimpa.includes("telefone_gabinete")) {
        const match = linhaLimpa.match(/"telefone_gabinete"\s*:\s*"([^"]+)"/);
        if (match) {
          dados.dados_contato.telefone_gabinete = match[1];
          console.log("✅ Telefone encontrado:", match[1]);
        }
      }

      // Assessores (detectar início do array)
      if (linhaLimpa.includes("assessores")) {
        if (linhaLimpa.includes("[")) {
          dados.dados_contato.assessores = [];
          console.log("✅ Assessores array iniciado");
        }
      }

      // Evidências (detectar início do array)
      if (linhaLimpa.includes("evidencias")) {
        if (linhaLimpa.includes("[")) {
          dados.evidencias = [];
          console.log("✅ Evidências array iniciado");
        }
      }
    }

    console.log("📊 Dados extraídos:", dados);
  } catch (error) {
    console.error("❌ Erro ao extrair dados do patch:", error);
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
  if (itens.telefone_gabinete)
    lista.push(`- ✅ Telefone: \`${itens.telefone_gabinete}\``);
  if (itens.assessores?.length > 0) {
    lista.push(`- ✅ ${itens.assessores.length} assessor(es)`);
  }
  if (itens.evidencias?.length > 0) {
    lista.push(`- ✅ ${itens.evidencias.length} evidência(s)`);
  }

  return lista.join("\n");
}

function extrairNomeDoPR(pr) {
  // Extrair nome do parlamentar do título do PR
  // Formato: "[CONTRIBUIÇÃO] Dados de NOME"
  const match = pr.title.match(/Dados de (.+)/i);
  if (match) {
    return match[1].trim();
  }

  // Ou do body
  const bodyMatch = pr.body?.match(/\*\*Parlamentar:\*\*\s*(.+?)\s*\(/);
  if (bodyMatch) {
    return bodyMatch[1].trim();
  }

  return null;
}
