// API para gerenciar contribuições pendentes
// Suporta: listagem, aprovação parcial, aprovação total, rejeição
// --- ATUALIZADO: Lê PRs do .YML e extrai CORREÇÕES do corpo do PR ---
import { Octokit } from "@octokit/rest";
import yaml from "js-yaml"; // Certifique-se que o 'js-yaml' está no seu package.json

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
          path: "_data/contribuicoes_pendentes.yml", // Caminho correto
          ref: branch,
        });

        const content = Buffer.from(fileData.content, "base64").toString(
          "utf-8"
        );
        const dados = yaml.load(content) || []; // Usar yaml.load
        contribuicoesConteudo = dados.filter((c) => c.status === "pendente");

        console.log(
          `✅ ${contribuicoesConteudo.length} contribuições de conteúdo encontradas`
        );
      } catch (error) {
        if (error.status === 404) {
          console.log(
            "ℹ️ Arquivo _data/contribuicoes_pendentes.yml não encontrado."
          );
        } else {
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

        const prsContribuicao = pulls.filter(
          (pr) =>
            pr.title.includes("[CONTRIBUIÇÃO]") ||
            pr.labels.some((l) => l.name === "contribuição")
        );

        // --- INÍCIO DO BLOCO DE LEITURA DE PR (ATUALIZADO) ---
        for (const pr of prsContribuicao) {
          try {
            console.log(`📋 Processando PR #${pr.number}: ${pr.title}`);

            // Buscar arquivos modificados no PR
            const { data: files } = await octokit.rest.pulls.listFiles({
              owner,
              repo,
              pull_number: pr.number,
            });

            // --- CORREÇÃO: Procurar pelo .YML ---
            const congressistasFile = files.find(
              (f) => f.filename === "_data/congressistas_extras.yml"
            );

            if (!congressistasFile) {
              console.log(
                `⚠️ PR #${pr.number} não modifica _data/congressistas_extras.yml`
              );
              continue;
            }

            console.log(
              `✅ PR #${pr.number} modifica _data/congressistas_extras.yml`
            );

            // Inicializa dados
            let dadosExtraidos = {
              id: null,
              nome: extrairNomeDoPR(pr),
              dados_contato: {}, // Novos dados
              evidencia: null, // Nova evidência
              correcoes: {}, // Correções sugeridas
            };
            let parlamentarId = null;

            // A. Tentar extrair NOVOS dados do *arquivo YML* modificado na branch do PR
            try {
              const { data: fileContent } = await octokit.rest.repos.getContent(
                {
                  owner,
                  repo,
                  path: "_data/congressistas_extras.yml", // <-- CORRIGIDO
                  ref: pr.head.ref, // Branch do PR
                }
              );

              const content = Buffer.from(
                fileContent.content,
                "base64"
              ).toString("utf-8");
              const congressistasYml = yaml.load(content); // <-- CORRIGIDO

              console.log(`📊 Conteúdo YML do PR #${pr.number} carregado.`);

              // --- CORREÇÃO: Acessar estrutura aninhada ---
              const congressistasAninhado = congressistasYml.congressistas;

              if (
                congressistasAninhado &&
                typeof congressistasAninhado === "object"
              ) {
                const idDoCorpo = extrairIdDoPR(pr);
                const parlamentarIds = Object.keys(congressistasAninhado);

                // Tenta encontrar o ID
                parlamentarId =
                  idDoCorpo && congressistasAninhado[idDoCorpo]
                    ? idDoCorpo
                    : parlamentarIds[parlamentarIds.length - 1];

                const parlamentarDados = congressistasAninhado[parlamentarId];

                if (parlamentarDados) {
                  dadosExtraidos.id = parlamentarId;
                  // Mapeia apenas os dados que podem ser *novos* (o YML no PR já os contém)
                  dadosExtraidos.dados_contato = {
                    whatsapp: parlamentarDados.whatsapp,
                    instagram: parlamentarDados.instagram,
                    assessores: parlamentarDados.assessores,
                  };
                  dadosExtraidos.evidencia = parlamentarDados.evidencias
                    ? parlamentarDados.evidencias[
                        parlamentarDados.evidencias.length - 1
                      ]
                    : null;
                  console.log(
                    `✅ NOVOS Dados extraídos do YML (ID ${parlamentarId}):`,
                    dadosExtraidos.dados_contato
                  );
                }
              }
              // --- FIM DA CORREÇÃO ---
            } catch (error) {
              console.error(
                `❌ Erro ao buscar/processar arquivo YML do PR #${pr.number}:`,
                error.message
              );
              // Fallback para patch (mantido, mas agora lê patch YML)
              dadosExtraidos.id = extrairIdDoPR(pr); // Tenta pegar ID do corpo
            }

            // B. Extrair CORREÇÕES do *corpo do PR*
            dadosExtraidos.correcoes = extrairCorrecoesDoPRBody(pr.body);
            if (Object.keys(dadosExtraidos.correcoes).length > 0) {
              console.log(
                `✅ CORREÇÕES extraídas do corpo do PR:`,
                dadosExtraidos.correcoes
              );
            }

            // Adicionar à lista de contribuições
            contribuicoesDados.push({
              pr_number: pr.number,
              pr_url: pr.html_url,
              parlamentar_id: dadosExtraidos.id || extrairIdDoPR(pr),
              parlamentar_nome:
                dadosExtraidos.nome || `ID: ${dadosExtraidos.id || "N/A"}`,
              pauta_slug: extrairPautaDoPR(pr),
              usuario_nome: pr.user.login,
              criado_em: pr.created_at,
              dados_contato: dadosExtraidos.dados_contato, // Novos dados
              evidencia: dadosExtraidos.evidencia, // Novas evidências
              correcoes: dadosExtraidos.correcoes, // Novas correções
            });

            console.log(`✅ Contribuição PR #${pr.number} adicionada à lista.`);
          } catch (error) {
            console.error(
              `❌ Erro geral ao processar PR #${pr.number}:`,
              error.message
            );
          }
        } // Fim do loop for
        // --- FIM DO BLOCO DE LEITURA DE PR ---

        console.log(
          `✅ ${contribuicoesDados.length} contribuições de dados (PRs YML) encontradas`
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
        console.log("✅ Aprovando itens selecionados... (Escrevendo no YAML)");

        const FILE_PATH = "_data/congressistas_extras.yml";
        let congressistasData = { congressistas: {} };
        let fileSha = null;

        try {
          // 1. Buscar arquivo atual de congressistas (YML)
          const { data: fileData } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: FILE_PATH,
            ref: branch,
          });

          fileSha = fileData.sha;
          const content = Buffer.from(fileData.content, "base64").toString(
            "utf-8"
          );
          congressistasData = yaml.load(content) || { congressistas: {} };
          console.log("✅ Arquivo .yml carregado");
        } catch (error) {
          if (error.status === 404) {
            console.log("ℹ️ Arquivo .yml não existe, será criado");
            congressistasData = { congressistas: {} };
            fileSha = null;
          } else {
            throw error;
          }
        }

        // 2. Atualizar dados do parlamentar
        if (!congressistasData.congressistas) {
          congressistasData.congressistas = {};
        }
        if (!congressistasData.congressistas[parlamentar_id]) {
          congressistasData.congressistas[parlamentar_id] = {};
        }

        const parlamentar = congressistasData.congressistas[parlamentar_id];

        // --- LÓGICA DE APROVAÇÃO (ATUALIZADA) ---

        // Adiciona Novos WhatsApps (se houver)
        if (itens.whatsapp && itens.whatsapp.length > 0) {
          if (!parlamentar.whatsapp) parlamentar.whatsapp = [];
          if (!Array.isArray(parlamentar.whatsapp))
            parlamentar.whatsapp = [parlamentar.whatsapp];

          itens.whatsapp.forEach((numeroWhatsApp) => {
            if (
              numeroWhatsApp &&
              !parlamentar.whatsapp.includes(numeroWhatsApp)
            ) {
              parlamentar.whatsapp.push(numeroWhatsApp);
              console.log(`✅ WhatsApp adicionado: ${numeroWhatsApp}`);
            }
          });
        }

        // Adiciona/Substitui Novo Instagram (se houver)
        if (itens.instagram) {
          parlamentar.instagram = itens.instagram;
          console.log(
            `✅ Instagram (novo) substituído/adicionado: @${itens.instagram}`
          );
        }

        // --- INÍCIO DA CORREÇÃO ---
        // APLICA A CORREÇÃO DE INSTAGRAM (se houver e for aprovada)
        // Isto sobrescreve qualquer valor de 'itens.instagram' se ambos forem enviados
        if (itens.correcao_instagram) {
          parlamentar.instagram = itens.correcao_instagram;
          console.log(
            `✅ Instagram (CORRIGIDO) substituído por: @${itens.correcao_instagram}`
          );
        }
        // --- FIM DA CORREÇÃO ---

        // Adiciona Novos Assessores (se houver)
        if (itens.assessores && itens.assessores.length > 0) {
          if (!parlamentar.assessores) parlamentar.assessores = [];
          itens.assessores.forEach((novoAss) => {
            const existe = parlamentar.assessores.some(
              (a) => a.whatsapp === novoAss.whatsapp
            );
            if (!existe) parlamentar.assessores.push(novoAss);
          });
          console.log(
            `✅ ${itens.assessores.length} assessores adicionados/mesclados.`
          );
        }

        // Adiciona Novas Evidências (se houver)
        if (itens.evidencias && itens.evidencias.length > 0) {
          if (!parlamentar.evidencias) parlamentar.evidencias = [];

          // Precisamos dos dados do PR para o contexto da evidência
          let prInfo = null;
          try {
            const { data } = await octokit.rest.pulls.get({
              owner,
              repo,
              pull_number: pr_number,
            });
            prInfo = data;
          } catch (prError) {
            console.warn(
              `Não foi possível buscar dados do PR #${pr_number} para contexto: ${prError.message}`
            );
          }

          itens.evidencias.forEach((novaEv) => {
            const existe = parlamentar.evidencias.some(
              (e) => e.url === novaEv.url
            );
            if (!existe) {
              novaEv.pauta_slug = prInfo ? extrairPautaDoPR(prInfo) : "geral";
              novaEv.contribuido_por = prInfo
                ? extrairUsuarioDoPR(prInfo)
                : "Comunidade";
              novaEv.data_contribuicao = new Date().toISOString();
              parlamentar.evidencias.push(novaEv);
            }
          });
          console.log(`✅ ${itens.evidencias.length} evidências adicionadas.`);
        }

        parlamentar.ultima_atualizacao = new Date().toISOString().split("T")[0];

        // 3. Salvar arquivo atualizado (YML)
        const newContent = yaml.dump(congressistasData, {
          indent: 2,
          lineWidth: -1,
          noRefs: true,
        });

        const commitData = {
          owner,
          repo,
          path: FILE_PATH,
          message: `Aprovar dados de ${parlamentar_id} (parcial) - PR #${pr_number}`,
          content: Buffer.from(newContent).toString("base64"),
          branch,
        };

        if (fileSha) {
          commitData.sha = fileSha;
        }

        await octokit.rest.repos.createOrUpdateFileContents(commitData);
        console.log("✅ Arquivo .yml salvo com sucesso na branch main.");

        // 4. Comentar e Fechar o PR
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
          labels: ["aprovado-parcialmente"],
        });
        await octokit.rest.pulls.update({
          owner,
          repo,
          pull_number: pr_number,
          state: "closed",
        });
        console.log("✅ PR fechado e comentado com sucesso!");

        return res.status(200).json({
          success: true,
          message: "Itens aprovados com sucesso (salvos no .yml)",
          parlamentar_id,
          itens_aprovados: itens,
        });
      }

      // ==========================================
      // REJEITAR CONTRIBUIÇÃO (PR)
      // ==========================================
      if (action === "reject" && pr_number) {
        console.log(`❌ Rejeitando PR #${pr_number}...`);

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

        let contentFileData = [];
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
            return res.status(404).json({
              error: "Arquivo de contribuições pendentes não encontrado.",
            });
          }
          throw error;
        }

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
          sha: contentFileSha,
        });

        console.log(
          `✅ Contribuição de conteúdo ID ${id} marcada como rejeitada.`
        );

        return res.status(200).json({
          success: true,
          message: "Contribuição rejeitada",
        });
      }

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

  return res.status(405).json({ error: "Método não permitido" });
}

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

// Esta função de fallback é menos confiável e provavelmente não funcionará bem
// com a estrutura aninhada do YML.
function extrairDadosDoPatch(patch) {
  console.warn(
    "⚠️ Usando a função de fallback extrairDadosDoPatch. Os resultados podem ser imprecisos."
  );
  const dados = {
    id: null,
    nome: null,
    dados_contato: {},
    evidencia: null,
    correcoes: {},
  };
  if (!patch) return dados;
  // Lógica de parsing de patch muito simples e provavelmente incorreta para YML.
  // Focamos em ler o arquivo completo (acima) e o corpo do PR.
  return dados;
}

function extrairPautaDoPR(pr) {
  const bodyMatch = pr.body?.match(/\*\*Pauta:\*\*\s*`([^`]+)`/i);
  if (bodyMatch) return bodyMatch[1];
  return null;
}

// --- NOVA FUNÇÃO ---
// Extrai as correções sugeridas do corpo do PR
function extrairCorrecoesDoPRBody(body) {
  const correcoes = {};
  if (!body) return correcoes;

  const instagramMatch = body.match(
    /- 📷 \*\*Correção de Instagram:\*\*\s*`([^`]+)`/i
  );
  if (instagramMatch) correcoes.instagram = instagramMatch[1];

  const whatsappMatch = body.match(/- 📱 \*\*Obs. WhatsApp:\*\*\s*`([^`]+)`/i);
  if (whatsappMatch) correcoes.whatsapp_obs = whatsappMatch[1];

  const assessoresMatch = body.match(
    /- 👥 \*\*Obs. Assessores:\*\*\s*`([^`]+)`/i
  );
  if (assessoresMatch) correcoes.assessores_obs = assessoresMatch[1];

  return correcoes;
}
// --- FIM DA NOVA FUNÇÃO ---

// ATUALIZADO para incluir correções
function gerarListaItensAprovados(itens) {
  const lista = [];

  if (itens.whatsapp && itens.whatsapp.length > 0)
    lista.push(
      `- ✅ ${
        itens.whatsapp.length
      } Novo(s) WhatsApp(s): \`${itens.whatsapp.join(", ")}\``
    );

  if (itens.instagram)
    lista.push(
      `- ✅ Novo Instagram (Adicionado/Substituído): \`@${itens.instagram}\``
    );

  // --- INÍCIO DA ADIÇÃO ---
  if (itens.correcao_instagram)
    lista.push(
      `- ⚠️ **Instagram CORRIGIDO para:** \`@${itens.correcao_instagram}\``
    );
  // --- FIM DA ADIÇÃO ---

  if (itens.telefone_gabinete)
    lista.push(`- ✅ Novo Telefone: \`${itens.telefone_gabinete}\``);

  if (itens.assessores?.length > 0)
    lista.push(`- ✅ ${itens.assessores.length} Novo(s) Assessor(es)`);

  if (itens.evidencias?.length > 0)
    lista.push(`- ✅ ${itens.evidencias.length} Nova(s) Evidência(s)`);

  // Observações (apenas informa o admin que foram vistas, não salvas)
  if (itens.whatsapp_obs)
    lista.push(`- ℹ️ Obs. WhatsApp (Lida): "${itens.whatsapp_obs}"`);

  if (itens.assessores_obs)
    lista.push(`- ℹ️ Obs. Assessores (Lida): "${itens.assessores_obs}"`);

  return lista.join("\n") || "- Nenhum item específico aprovado.";
}

function extrairNomeDoPR(pr) {
  const titleMatch = pr.title?.match(/Dados de (.+)/i);
  if (titleMatch) return titleMatch[1].trim();
  const bodyMatch = pr.body?.match(/\*\*Parlamentar:\*\*\s*(.+?)\s*\(/);
  if (bodyMatch) return bodyMatch[1].trim();
  return null;
}

function extrairUsuarioDoPR(pr) {
  if (pr && pr.user && pr.user.login) {
    return pr.user.login;
  }
  const bodyMatch = pr.body?.match(/\*\*Contribuído por:\*\*\s*(.+?)\s*\(/);
  if (bodyMatch) return bodyMatch[1].trim();
  return null;
}

function extrairIdDoPR(pr) {
  const bodyMatch = pr.body?.match(/\(ID:\s*([^\)]+)\)/i);
  if (bodyMatch) {
    return bodyMatch[1].trim();
  }
  return null;
}
