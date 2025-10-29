// API para gerenciar contribuições pendentes
// Suporta: listagem, aprovação parcial, aprovação total, rejeição
import { Octokit } from "@octokit/rest";
import yaml from "js-yaml"; // <-- Verifique se esta linha está presente

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

      // 1. Buscar contribuições de CONTEÚDO (arquivo YAML)
      let contribuicoesConteudo = [];
      try {
        const { data: fileData } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: "_data/contribuicoes_pendentes.yml", // <-- Lendo o YML
          ref: branch,
        });

        const content = Buffer.from(fileData.content, "base64").toString(
          "utf-8"
        );
        const dados = yaml.load(content) || []; // <-- Usando yaml.load
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
        } else {
          console.log(
            "ℹ️ Arquivo _data/contribuicoes_pendentes.yml não encontrado."
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

        // --- INÍCIO DO BLOCO SUBSTITUÍDO ---
        for (const pr of prsContribuicao) {
          try {
            console.log(`📋 Processando PR #${pr.number}: ${pr.title}`);

            // Buscar arquivos modificados no PR
            const { data: files } = await octokit.rest.pulls.listFiles({
              owner,
              repo,
              pull_number: pr.number,
            });

            // Verificar se modifica congressistas_extras.json
            const congressistasFile = files.find(
              (f) => f.filename === "_data/congressistas_extras.json"
            );

            if (!congressistasFile) {
              console.log(
                `⚠️ PR #${pr.number} não modifica _data/congressistas_extras.json`
              );
              continue; // Pula para o próximo PR se o arquivo correto não foi modificado
            }

            console.log(
              `✅ PR #${pr.number} modifica _data/congressistas_extras.json`
            );

            // Inicializa dados extraídos
            let dadosExtraidos = {
              id: null,
              nome: extrairNomeDoPR(pr), // Tenta extrair nome do título/corpo do PR
              dados_contato: {},
              evidencia: null,
            };
            let parlamentarId = null; // Para guardar o ID encontrado

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
              const congressistasJson = JSON.parse(content); // JSON completo { congressistas: { ... } }

              console.log(`📊 Conteúdo JSON do PR #${pr.number} carregado.`);

              // --- INÍCIO DA CORREÇÃO ---
              // 1. Acessar o objeto aninhado 'congressistas'
              const congressistasAninhado = congressistasJson.congressistas;

              if (
                congressistasAninhado &&
                typeof congressistasAninhado === "object"
              ) {
                // 2. Encontrar qual parlamentar foi modificado/adicionado
                const parlamentarIds = Object.keys(congressistasAninhado);

                if (parlamentarIds.length > 0) {
                  // Tenta pegar o ID do corpo do PR se disponível, senão usa o último
                  const idDoCorpo = extrairIdDoPR(pr);
                  parlamentarId =
                    idDoCorpo && congressistasAninhado[idDoCorpo]
                      ? idDoCorpo
                      : parlamentarIds[parlamentarIds.length - 1];

                  // 3. Acessar os dados DENTRO do objeto aninhado
                  const parlamentarDados = congressistasAninhado[parlamentarId];

                  if (parlamentarDados) {
                    dadosExtraidos.id = parlamentarId; // Guarda o ID encontrado
                    // 4. Mapear os dados corretamente para a estrutura esperada pelo frontend
                    dadosExtraidos.dados_contato = {
                      whatsapp: parlamentarDados.whatsapp,
                      instagram: parlamentarDados.instagram,
                      telefone_gabinete: parlamentarDados.telefone_gabinete, // Pode não existir neste JSON
                      assessores: parlamentarDados.assessores,
                    };
                    // Pega a última evidência adicionada, se houver
                    dadosExtraidos.evidencia = parlamentarDados.evidencias
                      ? parlamentarDados.evidencias[
                          parlamentarDados.evidencias.length - 1
                        ]
                      : null;

                    console.log(
                      `✅ Dados extraídos do JSON (ID ${parlamentarId}):`,
                      dadosExtraidos
                    );
                  } else {
                    console.warn(
                      `⚠️ ID ${parlamentarId} encontrado nas chaves, mas dados não encontrados no objeto aninhado.`
                    );
                  }
                } else {
                  console.warn(
                    `⚠️ Objeto 'congressistas' está vazio no JSON do PR.`
                  );
                }
              } else {
                console.warn(
                  `⚠️ Estrutura JSON inesperada: chave 'congressistas' não encontrada ou não é um objeto.`
                );
              }
              // --- FIM DA CORREÇÃO ---
            } catch (error) {
              console.error(
                `❌ Erro ao buscar/processar arquivo JSON do PR #${pr.number}:`,
                error.message
              );
              // Fallback para patch (mantido, mas menos confiável)
              console.log("⚠️ Usando fallback: extrair do patch");
              dadosExtraidos = extrairDadosDoPatch(congressistasFile.patch);
              parlamentarId = dadosExtraidos.id; // Tenta pegar ID do patch
            }

            // Adicionar à lista de contribuições
            contribuicoesDados.push({
              pr_number: pr.number,
              pr_url: pr.html_url,
              parlamentar_id: parlamentarId, // Usa o ID encontrado
              parlamentar_nome:
                dadosExtraidos.nome || `ID: ${parlamentarId || "N/A"}`, // Usa nome extraído ou ID
              pauta_slug: extrairPautaDoPR(pr),
              usuario_nome: pr.user.login,
              criado_em: pr.created_at,
              // Passa os objetos extraídos para o frontend
              dados_contato: dadosExtraidos.dados_contato,
              evidencia: dadosExtraidos.evidencia,
            });

            console.log(`✅ Contribuição PR #${pr.number} adicionada à lista.`);
          } catch (error) {
            console.error(
              `❌ Erro geral ao processar PR #${pr.number}:`,
              error.message
            );
          }
        } // Fim do loop for
        // --- FIM DO BLOCO SUBSTITUÍDO ---

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
        `📝 Ação: ${action} | PR: ${pr_number} | Parlamentar: ${parlamentar_id} | ID Conteúdo: ${id}`
      );

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

        // --- INÍCIO DA CORREÇÃO (Bug 2) ---
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

          if (
            numeroWhatsApp &&
            !parlamentar.whatsapp.includes(numeroWhatsApp)
          ) {
            // Adicionado check !numeroWhatsApp
            parlamentar.whatsapp.push(numeroWhatsApp);
            console.log(`✅ WhatsApp adicionado: ${numeroWhatsApp}`);
          } else if (numeroWhatsApp) {
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
        // OBS: Evidências neste fluxo vêm do PR, não do YAML geral de evidências
        if (itens.evidencias && itens.evidencias.length > 0) {
          if (!parlamentar.evidencias) {
            // <-- CORREÇÃO: Adiciona em 'congressistas_extras.yml'
            parlamentar.evidencias = [];
          }
          itens.evidencias.forEach((novaEv) => {
            const existe = parlamentar.evidencias.some(
              (e) => e.url === novaEv.url
            );
            if (!existe) {
              // Adiciona dados extras à evidência salva aqui
              novaEv.pauta_slug = extrairPautaDoPR(pr) || "geral"; // Adiciona slug da pauta do PR
              novaEv.contribuido_por = extrairUsuarioDoPR(pr) || "Comunidade"; // Adiciona usuário do PR
              novaEv.data_contribuicao = new Date().toISOString(); // Adiciona data de aprovação
              parlamentar.evidencias.push(novaEv);
            }
          });
        }

        // Adicionar data de atualização (importante)
        parlamentar.ultima_atualizacao = new Date().toISOString().split("T")[0];

        // 3. Salvar arquivo atualizado (YML)
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
          labels: ["aprovado-parcialmente"], // Corrigido nome da label
        });

        await octokit.rest.pulls.update({
          owner,
          repo,
          pull_number: pr_number,
          state: "closed",
        });

        console.log("✅ PR fechado e comentado com sucesso!");
        // --- FIM DA CORREÇÃO (Bug 2) ---

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

        // Adicionar label 'rejeitado'
        await octokit.rest.issues.addLabels({
          owner,
          repo,
          issue_number: pr_number,
          labels: ["rejeitado"],
        });

        console.log("✅ PR fechado, comentado e label adicionada.");

        return res.status(200).json({
          success: true,
          message: "Contribuição rejeitada",
        });
      }

      // ==========================================
      // REJEITAR CONTRIBUIÇÃO DE CONTEÚDO (YML)
      // ==========================================
      if (action === "reject_content" && id) {
        console.log(`❌ Rejeitando contribuição de conteúdo ID: ${id}...`);
        const CONTENT_FILE_PATH = "_data/contribuicoes_pendentes.yml";

        // Buscar arquivo atual
        let contentFileData = {};
        let contentFileSha = null;
        try {
          const { data: fileData } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: CONTENT_FILE_PATH,
            ref: branch,
          });
          contentFileSha = fileData.sha;
          const currentContent = Buffer.from(
            fileData.content,
            "base64"
          ).toString("utf-8");
          contentFileData = yaml.load(currentContent) || [];
          console.log(`✅ Arquivo ${CONTENT_FILE_PATH} carregado.`);
        } catch (error) {
          if (error.status === 404) {
            console.log(`ℹ️ Arquivo ${CONTENT_FILE_PATH} não existe.`);
            return res
              .status(404)
              .json({
                error: "Arquivo de contribuições pendentes não encontrado.",
              });
          }
          throw error;
        }

        // Marcar como rejeitada
        let found = false;
        const updatedContribuicoes = contentFileData.map((c) => {
          if (c.id === id) {
            found = true;
            return {
              ...c,
              status: "rejeitada",
              rejeitada_em: new Date().toISOString(),
            };
          }
          return c;
        });

        if (!found) {
          console.warn(
            `⚠️ Contribuição com ID ${id} não encontrada para rejeitar.`
          );
          return res
            .status(404)
            .json({ error: `Contribuição ID ${id} não encontrada.` });
        }

        // Salvar
        const newYamlContent = yaml.dump(updatedContribuicoes, {
          indent: 2,
          lineWidth: -1,
          noRefs: true,
        });

        await octokit.rest.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: CONTENT_FILE_PATH,
          message: `Rejeitar contribuição de conteúdo ${id}`,
          content: Buffer.from(newYamlContent).toString("base64"),
          branch,
          sha: contentFileSha, // SHA é obrigatório para atualizar
        });

        console.log(
          `✅ Contribuição de conteúdo ID ${id} marcada como rejeitada.`
        );

        return res.status(200).json({
          success: true,
          message: "Contribuição rejeitada",
        });
      }

      // Se nenhuma ação válida foi identificada
      return res
        .status(400)
        .json({ error: "Ação inválida ou parâmetros insuficientes" });
    } catch (error) {
      console.error("❌ Erro ao processar ação:", error);
      return res.status(500).json({
        success: false,
        error: "Erro ao processar ação",
        details: error.message,
      });
    }
  }

  // Se o método HTTP não for GET ou POST
  return res.status(405).json({ error: "Método não permitido" });
}

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

function extrairDadosDoPatch(patch) {
  // ATENÇÃO: Esta função é um fallback e MENOS confiável que ler o JSON completo.
  // Ela também precisa ser ajustada para a estrutura { congressistas: { ... } }
  const dados = {
    id: null,
    nome: null, // Nome não está no patch, precisa vir do PR
    dados_contato: {},
    evidencia: null,
  };

  try {
    console.log("🔍 (Fallback) Extraindo dados do patch...");
    if (!patch) return dados; // Retorna vazio se patch for nulo/undefined

    const linhas = patch.split("\n");
    let dentroDoObjetoParlamentar = false;
    let dentroDeArray = null; // 'whatsapp', 'assessores', 'evidencias'

    for (const linha of linhas) {
      // Procurar linhas adicionadas (+) que não sejam a linha de diff (+++)
      if (linha.startsWith("+") && !linha.startsWith("+++")) {
        const linhaLimpa = linha.substring(1).trim().replace(/,$/, ""); // Remove '+' e vírgula no final

        // Tentar extrair ID da chave principal (pode falhar se mudança for interna)
        if (linhaLimpa.match(/^"[^"]+"\s*:\s*{/)) {
          const matchId = linhaLimpa.match(/^"([^"]+)"/);
          if (matchId) {
            dados.id = matchId[1];
            dentroDoObjetoParlamentar = true; // Assume que estamos dentro do objeto deste ID
            console.log("  (Patch) ID encontrado:", dados.id);
          }
        }

        if (dentroDoObjetoParlamentar) {
          // Detectar início de arrays
          if (linhaLimpa.includes('"whatsapp": [')) dentroDeArray = "whatsapp";
          else if (linhaLimpa.includes('"assessores": ['))
            dentroDeArray = "assessores";
          else if (linhaLimpa.includes('"evidencias": ['))
            dentroDeArray = "evidencias";

          // Detectar fim de arrays
          if (linhaLimpa.includes("]")) dentroDeArray = null;

          // Extrair valores simples ou itens de array
          const matchSimples = linhaLimpa.match(/"([^"]+)"\s*:\s*"([^"]+)"/);
          if (matchSimples) {
            const key = matchSimples[1];
            const value = matchSimples[2];
            if (key === "instagram") dados.dados_contato.instagram = value;
            if (key === "telefone_gabinete")
              dados.dados_contato.telefone_gabinete = value;
            console.log(`  (Patch) Chave simples: ${key}=${value}`);
          } else if (dentroDeArray === "whatsapp") {
            // Extrair valor do array de whatsapp
            const matchWa = linhaLimpa.match(/"([^"]+)"/);
            if (matchWa) {
              if (!dados.dados_contato.whatsapp)
                dados.dados_contato.whatsapp = [];
              if (!dados.dados_contato.whatsapp.includes(matchWa[1])) {
                dados.dados_contato.whatsapp.push(matchWa[1]);
                console.log(`  (Patch) Item WhatsApp: ${matchWa[1]}`);
              }
            }
          }
          // Adicionar lógica similar para 'assessores' e 'evidencias' se necessário
        }
      }
    }
    console.log("📊 (Fallback) Dados extraídos do patch:", dados);
  } catch (error) {
    console.error("❌ Erro ao extrair dados do patch (fallback):", error);
  }
  return dados;
}

function extrairPautaDoPR(pr) {
  // Tenta extrair do corpo: **Pauta:** `SLUG`
  const bodyMatch = pr.body?.match(/\*\*Pauta:\*\*\s*`([^`]+)`/i);
  if (bodyMatch) return bodyMatch[1];
  return null; // Retorna null se não encontrar
}

function gerarListaItensAprovados(itens) {
  const lista = [];
  if (itens.whatsapp) lista.push(`- ✅ WhatsApp: \`${itens.whatsapp}\``);
  if (itens.instagram) lista.push(`- ✅ Instagram: \`${itens.instagram}\``);
  if (itens.telefone_gabinete)
    lista.push(`- ✅ Telefone: \`${itens.telefone_gabinete}\``);
  if (itens.assessores?.length > 0)
    lista.push(`- ✅ ${itens.assessores.length} assessor(es)`);
  if (itens.evidencias?.length > 0)
    lista.push(`- ✅ ${itens.evidencias.length} evidência(s)`);
  return lista.join("\n") || "- Nenhum item específico listado."; // Garante que não retorne string vazia
}

function extrairNomeDoPR(pr) {
  // Tenta extrair do título: [CONTRIBUIÇÃO] Dados de NOME
  const titleMatch = pr.title?.match(/Dados de (.+)/i);
  if (titleMatch) return titleMatch[1].trim();

  // Tenta extrair do corpo: **Parlamentar:** NOME (ID: ...)
  const bodyMatch = pr.body?.match(/\*\*Parlamentar:\*\*\s*(.+?)\s*\(/);
  if (bodyMatch) return bodyMatch[1].trim();

  return null; // Retorna null se não encontrar
}

// Adicionada para extrair usuário do PR, usado ao salvar evidência
function extrairUsuarioDoPR(pr) {
  if (pr && pr.user && pr.user.login) {
    return pr.user.login;
  }
  // Tenta extrair do corpo: **Contribuído por:** NOME (...)
  const bodyMatch = pr.body?.match(/\*\*Contribuído por:\*\*\s*(.+?)\s*\(/);
  if (bodyMatch) return bodyMatch[1].trim();

  return null;
}

// Adicionada para extrair ID do PR (usado na correção)
function extrairIdDoPR(pr) {
  // Extrair ID do parlamentar do corpo do PR
  // Formato: **Parlamentar:** NOME (ID: 123456)
  const bodyMatch = pr.body?.match(/\(ID:\s*([^\)]+)\)/i);
  if (bodyMatch) {
    return bodyMatch[1].trim();
  }
  return null;
}
