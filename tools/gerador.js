// Variáveis globais
let deputados = [];
let pautas = [];
let contribuicoesPendentes = [];
let congressistasExtras = {};
let sessionToken = null;
let parlamentarCount = 0;

const API_URL = ""; // Usar caminhos absolutos do servidor

// Login
async function login() {
  const password = document.getElementById("passwordInput").value;
  const errorEl = document.getElementById("loginError");

  try {
    const response = await fetch(`/api/auth-admin`, {
      // Caminho absoluto
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const data = await response.json();

    if (data.success) {
      sessionToken = data.token;
      localStorage.setItem("adminToken", data.token);
      localStorage.setItem("tokenExpires", data.expiresAt);

      document.getElementById("loginScreen").classList.add("hidden");
      document.getElementById("mainContent").classList.remove("hidden");

      carregarDados();
      configurarCarregamentoCondicional(); // Configurar listener da "Casa"
    } else {
      errorEl.textContent = "❌ Senha incorreta!";
      errorEl.classList.remove("hidden");
      errorEl.style.display = "flex";
    }
  } catch (error) {
    errorEl.textContent = "❌ Erro ao conectar. Tente novamente.";
    errorEl.classList.remove("hidden");
    errorEl.style.display = "flex";
  }
}

// Verificar autenticação
function checkAuth() {
  const token = localStorage.getItem("adminToken");
  const expires = localStorage.getItem("tokenExpires");

  if (token && expires && Date.now() < parseInt(expires)) {
    sessionToken = token;
    document.getElementById("loginScreen").classList.add("hidden");
    document.getElementById("mainContent").classList.remove("hidden");

    carregarDados();
    configurarCarregamentoCondicional(); // Configurar listener da "Casa"
  }
}

// Configurar carregamento condicional de parlamentares
function configurarCarregamentoCondicional() {
  const casaSelect = document.getElementById("casa");
  let casaAnterior = "";

  if (casaSelect) {
    casaSelect.addEventListener("change", function () {
      const casa = this.value;
      const inputAdd = document.getElementById("autocomplete-input");

      // Habilitar input se casa selecionada (e não for plenário)
      const isPlenary = document.getElementById("is_plenary_vote").checked;
      if (casa && !isPlenary) {
        inputAdd.disabled = false;

        // Carregar deputados se necessário (primeira vez)
        if (deputados.length === 0) {
          loadDeputados();
        }
      } else if (!isPlenary) {
        inputAdd.disabled = true;
      }

      // Limpar parlamentares se mudar de casa
      const lista = document.getElementById("parlamentaresList");
      const temParlamentares = !lista.querySelector("p");

      if (temParlamentares && casaAnterior && casa !== casaAnterior) {
        if (
          confirm(
            "⚠️ Ao mudar a Casa Legislativa, os parlamentares já adicionados serão removidos. Continuar?"
          )
        ) {
          lista.innerHTML =
            '<p style="color: #999; text-align: center;">Nenhum parlamentar adicionado</p>';
        } else {
          // Reverter seleção
          this.value = casaAnterior;
        }
      }

      casaAnterior = casa;
    });
  }
}

// ==========================================
// CARREGAR PARLAMENTARES (NOVA VERSÃO)
// ==========================================
async function loadDeputados() {
  const statusEl = document.getElementById("loadingDeputados");

  try {
    if (statusEl) {
      statusEl.className = "loading";
      statusEl.innerHTML =
        '<span class="spinner"></span><span>Carregando parlamentares...</span>';
      statusEl.classList.remove("hidden");
    }

    // 1. Tenta carregar o cache (caminho relativo à raiz do site)
    const cacheResponse = await fetch("/parlamentares_cache.json");

    if (!cacheResponse.ok) {
      // Se o gerador.html estiver em /tools/, o ../ é necessário
      // Vamos tentar o caminho relativo
      console.log(
        "Cache /parlamentares_cache.json não encontrado, tentando ../"
      );
      const relativeCacheResponse = await fetch("../parlamentares_cache.json");

      if (!relativeCacheResponse.ok) {
        throw new Error(
          `Erro HTTP: ${relativeCacheResponse.status} (Ambas tentativas de cache falharam)`
        );
      }
      // Se chegou aqui, o ../ funcionou
      return processarCache(await relativeCacheResponse.json(), statusEl);
    }

    // Se chegou aqui, o / funcionou
    return processarCache(await cacheResponse.json(), statusEl);
  } catch (error) {
    // Se qualquer etapa falhar (fetch, .json(), ou parsing), o erro será pego aqui
    console.error("Erro ao carregar parlamentares:", error);
    if (statusEl) {
      statusEl.className = "loading error";
      statusEl.innerHTML = `<span>❌ Erro ao carregar parlamentares. Verifique o console.</span>`;
    }
  }
}

function processarCache(cacheData, statusEl) {
  // 3. Lê a NOVA estrutura (cacheData.parlamentares)
  if (cacheData.parlamentares && cacheData.parlamentares.length > 0) {
    // Mapeia os dados do cache
    deputados = cacheData.parlamentares.map((p) => ({
      id: p.id,
      nome: p.nome,
      partido: p.partido,
      uf: p.uf,
      email: p.email || "N/A",
      casa: p.casa,
    }));

    if (statusEl) {
      statusEl.className = "loading success";
      statusEl.innerHTML = `<span>✅ ${deputados.length} parlamentares carregados do cache!</span>`;
      setTimeout(() => statusEl.classList.add("hidden"), 3000);
    }
    console.log(
      "Parlamentares carregados do cache (nova estrutura):",
      deputados.length
    );

    // ==========================================================
    // ATIVAR O AUTOCOMPLETE
    // ==========================================================
    const input = document.getElementById("autocomplete-input");
    if (input) {
      console.log("Ativando listeners no #autocomplete-input");

      // Prevenir submit do formulário ao pressionar "Enter"
      input.onkeydown = function (event) {
        if (event.key === "Enter") {
          event.preventDefault(); // Impede o submit
          return false;
        }
      };

      // Event listener para autocomplete
      input.oninput = function () {
        const list = document.getElementById("autocomplete-list");
        if (!list) return; // Proteção

        const termo = this.value.toLowerCase();

        if (termo.length < 2) {
          list.classList.remove("show");
          return;
        }

        const casaSelecionada = document.getElementById("casa").value;

        // Usar a variável global 'deputados' que acabamos de carregar
        const parlamentaresFiltrados = deputados
          .filter((p) => {
            const nomeMatch = p.nome.toLowerCase().includes(termo);
            const casaMatch =
              (casaSelecionada.includes("Câmara") && p.casa === "Câmara") ||
              (casaSelecionada.includes("Senado") && p.casa === "Senado");
            return nomeMatch && casaMatch;
          })
          .slice(0, 10);

        if (parlamentaresFiltrados.length === 0) {
          list.innerHTML =
            '<div class="no-results">Nenhum resultado encontrado</div>';
          list.classList.add("show");
          return;
        }

        list.innerHTML = parlamentaresFiltrados
          .map(
            (p) => `
                    <div class="autocomplete-item" onclick="selecionarParlamentar('${
                      p.id
                    }', '${p.nome.replace(/'/g, "\\'")}', '${p.partido}', '${
              p.uf
            }')">
                        <strong>${p.nome}</strong><br>
                        <small>${p.partido}-${p.uf}</small>
                    </div>
                `
          )
          .join("");

        list.classList.add("show");
      };
    } else {
      console.error(
        "Não foi possível encontrar o elemento #autocomplete-input para anexar listeners."
      );
    }
    // ==========================================================
    // FIM DO CÓDIGO NOVO
    // ==========================================================
  } else {
    // O cache foi lido, mas a estrutura está errada
    throw new Error(
      'Formato do cache JSON é inválido. Chave "parlamentares" não encontrada.'
    );
  }
}

// Carregar todos os dados
async function carregarDados() {
  await Promise.all([
    carregarPautas(),
    carregarCongressistas(),
    carregarContribuicoes(),
  ]);
  atualizarEstatisticas();
}

// Carregar pautas
async function carregarPautas() {
  try {
    document.getElementById("loadingPautas").classList.remove("hidden");

    const response = await fetch(`/api/pautas`);
    const data = await response.json();
    pautas = data.pautas || [];

    document.getElementById("loadingPautas").classList.add("hidden");
    renderPautas();
  } catch (error) {
    console.error("Erro ao carregar pautas:", error);
    document.getElementById("loadingPautas").className = "loading error";
    document.getElementById("loadingPautas").innerHTML =
      "<span>❌ Erro ao carregar</span>";
  }
}

// Render pautas
function renderPautas() {
  const grid = document.getElementById("pautasGrid");

  if (pautas.length === 0) {
    grid.innerHTML =
      '<p style="grid-column: 1/-1; text-align: center; color: #999;">Nenhuma pauta encontrada.</p>';
    return;
  }

  grid.innerHTML = pautas
    .map(
      (pauta) => `
        <div class="card">
            <div class="card-title">${pauta.title}</div>
            <div class="card-info">
                ${pauta.description}<br>
                <strong>Casa:</strong> ${pauta.casa}<br>
                <strong>Status:</strong> ${pauta.status}
                ${
                  pauta.featured
                    ? "<br>⭐ <strong>Pauta Principal</strong>"
                    : ""
                }
                ${
                  pauta.is_plenary_vote
                    ? "<br>🏛️ <strong>Votação em Plenário</strong>"
                    : ""
                }
            </div>
            <div class="card-actions">
                <button class="btn btn-small" onclick="verPauta('${
                  pauta.filename
                }')">👁️ Ver</button>
                <button class="btn btn-small btn-warning" onclick="alterarPauta('${
                  pauta.filename
                }')">✏️ Alterar</button>
                <button class="btn btn-small btn-danger" onclick="excluirPauta('${
                  pauta.filename
                }', '${pauta.title}')">🗑️ Excluir</button>
            </div>
        </div>
    `
    )
    .join("");
}

function filterPautas() {
  const query = document.getElementById("searchPautas").value.toLowerCase();
  const cards = document.querySelectorAll("#pautasGrid .card");

  cards.forEach((card) => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(query) ? "block" : "none";
  });
}

function verPauta(filename) {
  const url = `${window.location.origin}/pautas/${filename.replace(
    ".md",
    ""
  )}/`;
  window.open(url, "_blank");
}

async function excluirPauta(filename, title) {
  if (
    !confirm(
      `⚠️ Tem certeza que deseja excluir a pauta "${title}"?\n\nEsta ação não pode ser desfeita!`
    )
  ) {
    return;
  }

  try {
    const response = await fetch(`/api/pautas`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ filename }),
    });

    const data = await response.json();

    if (data.success) {
      alert("✅ Pauta excluída com sucesso!");
      carregarPautas();
    } else {
      alert("❌ Erro: " + data.message);
    }
  } catch (error) {
    alert("❌ Erro ao excluir: " + error.message);
  }
}

// ADICIONE ESTA FUNÇÃO em gerador.js

function toggleCampaignChannel(channel) {
    const checkbox = document.getElementById(`enable-campaign-${channel}`);
    const section = document.getElementById(`campaign-channel-${channel}`); // Seção de configs específicas
    const oppositionTextarea = document.getElementById('campaign-message-opposition');
    const supportTextarea = document.getElementById('campaign-message-support');
    const subjectInput = document.getElementById('email-assunto'); // Específico do email

    if (checkbox && checkbox.checked) {
        // Se ativou, mostra a seção específica (se houver)
        if (section) section.classList.remove('hidden');
        // Garante que os campos principais são obrigatórios se *qualquer* canal estiver ativo
        oppositionTextarea.required = true;
        supportTextarea.required = true;
        if(channel === 'email' && subjectInput) subjectInput.required = true;

    } else {
        // Se desativou, esconde a seção específica
        if (section) section.classList.add('hidden');
         if(channel === 'email' && subjectInput) subjectInput.required = false;

        // Verifica se *nenhum* canal está ativo para tornar os campos principais não-obrigatórios
        const anyActive = ['email', 'whatsapp', 'instagram'].some(ch =>
            document.getElementById(`enable-campaign-${ch}`)?.checked
        );
        if (!anyActive) {
            oppositionTextarea.required = false;
            supportTextarea.required = false;
        }
    }
}


// SUBSTITUA A FUNÇÃO coletarDadosFormulario em gerador.js (VERSÃO FINAL COM CAMPANHAS)

function coletarDadosFormulario() {
    const title = document.getElementById('title').value;
    const descriptionRaw = document.getElementById('description').value;
    const casa = document.getElementById('casa').value;
    const status = document.getElementById('status').value;
    const featured = document.getElementById('featured').checked;
    const isPlenaryVote = document.getElementById('is_plenary_vote').checked;
    const body = document.getElementById('body').value;

    let descriptionFormatted = '';
    // ... (lógica de formatação da descrição igual à anterior) ...
     if (descriptionRaw) {
        const lines = descriptionRaw.split('\n');
        descriptionFormatted = '|\n';
        lines.forEach(line => {
            descriptionFormatted += `  ${line}\n`;
        });
        descriptionFormatted = descriptionFormatted.trimEnd();
    }


    const parlamentares = [];
    // ... (lógica de coleta de parlamentares igual à anterior) ...
     if (!isPlenaryVote) {
        document.querySelectorAll('.parlamentar-item').forEach(item => {
            const roleInput = item.querySelector('.parl-role');
            const positionSelect = item.querySelector('.parl-position');
            if (roleInput && positionSelect) {
                 let dep = null;
                 try {
                    dep = JSON.parse(roleInput.dataset.deputado.replace(/&apos;/g, "'").replace(/&quot;/g, '"'));
                 } catch (e) {
                     console.error("Erro ao parsear data-deputado:", roleInput.dataset.deputado, e);
                     return;
                 }
                parlamentares.push({
                    nome: dep.nome,
                    role: roleInput.value || '',
                    position: positionSelect.value
                });
            }
        });
    }


    // --- NOVA LÓGICA: Coleta de Dados das Campanhas ---
    const enableEmail = document.getElementById('enable-campaign-email').checked;
    const enableWhatsApp = document.getElementById('enable-campaign-whatsapp').checked;
    const enableInstagram = document.getElementById('enable-campaign-instagram').checked;

    const msgOpposition = document.getElementById('campaign-message-opposition').value;
    const msgSupport = document.getElementById('campaign-message-support').value;
    const emailSubject = document.getElementById('email-assunto').value;
    const emailExtra = document.getElementById('campaign-message-email-extra').value;
    // --- FIM DA NOVA LÓGICA ---

    // Gerar YAML
    let yaml = `---
layout: pauta
title: ${title}
description: ${descriptionFormatted || ''}
casa: ${casa}
status: ${status}
featured: ${featured}
is_plenary_vote: ${isPlenaryVote}
`;

    if (!isPlenaryVote && parlamentares.length > 0) {
        yaml += `key_players:\n`;
        parlamentares.forEach(p => {
            yaml += `  - nome: "${p.nome}"\n`;
            yaml += `    role: "${p.role}"\n`;
            yaml += `    position: "${p.position}"\n`;
        });
    }

    // --- NOVA LÓGICA: Geração do YAML das Campanhas ---
    const hasAnyCampaign = enableEmail || enableWhatsApp || enableInstagram;
    if (hasAnyCampaign && msgOpposition && msgSupport) { // Só adiciona se tiver mensagens principais
        yaml += `campanha:\n`;

        // Função auxiliar para formatar mensagem multiline
        const formatYamlMessage = (msg) => `|\n      ${msg.split('\n').join('\n      ')}`;

        if (enableEmail) {
            yaml += `  email:\n`;
            if (emailSubject) yaml += `    assunto: "${emailSubject}"\n`;
            yaml += `    mensagem_oposicao: ${formatYamlMessage(msgOpposition)}\n`;
            yaml += `    mensagem_apoio: ${formatYamlMessage(msgSupport)}\n`;
            if (emailExtra) yaml += `    mensagem_extra: ${formatYamlMessage(emailExtra)}\n`;
        }
        if (enableWhatsApp) {
            yaml += `  whatsapp:\n`;
            yaml += `    mensagem_oposicao: ${formatYamlMessage(msgOpposition)}\n`;
            yaml += `    mensagem_apoio: ${formatYamlMessage(msgSupport)}\n`;
        }
        if (enableInstagram) {
            yaml += `  instagram:\n`;
            yaml += `    mensagem_oposicao: ${formatYamlMessage(msgOpposition)}\n`;
            yaml += `    mensagem_apoio: ${formatYamlMessage(msgSupport)}\n`;
        }
    }
    // --- FIM DA NOVA LÓGICA ---

    yaml += `---\n\n${body}`;
    return yaml;
}


// SUBSTITUA A FUNÇÃO alterarPauta em gerador.js (VERSÃO FINAL COM CAMPANHAS)

async function alterarPauta(filename) {
    try {
        console.log('📝 Carregando pauta para edição:', filename);

        // Resetar estado (como antes)
        document.getElementById('pautaForm').reset();
        // ... (resto do código de reset igual) ...
        const listaParl = document.getElementById('parlamentaresList');
        if (listaParl) listaParl.innerHTML = '<p style="color: #999; text-align: center;">Nenhum parlamentar adicionado</p>';
        const autocompleteInput = document.getElementById('autocomplete-input');
        if (autocompleteInput) autocompleteInput.value = '';
        const autocompleteList = document.getElementById('autocomplete-list');
        if (autocompleteList) autocompleteList.classList.remove('show');
        const oldAlert = document.getElementById('edit-mode');
        if (oldAlert) oldAlert.remove();
        // Resetar checkboxes de campanha
        document.getElementById('enable-campaign-email').checked = false;
        document.getElementById('enable-campaign-whatsapp').checked = false;
        document.getElementById('enable-campaign-instagram').checked = false;
        toggleCampaignChannel('email'); // Garante que seções extras estejam ocultas
        toggleCampaignChannel('whatsapp');
        toggleCampaignChannel('instagram');


        // Buscar e parsear dados (como antes)
        const response = await fetch(`/api/edit-pauta?filename=${filename}`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Erro ao buscar pauta');
        // ... (resto do parse do Front Matter e key_players igual) ...
         const content = data.content;
        const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (!frontMatterMatch) throw new Error('Formato de pauta inválido');

        const frontMatter = frontMatterMatch[1];
        const body = frontMatterMatch[2].trim();
        const pautaData = {};
        let keyPlayersData = [];
        let campanhaData = {}; // Objeto para guardar dados da campanha parseados

        const lines = frontMatter.split('\n');
        let currentKey = '';
        let multilineValue = '';
        let inMultiline = false;
        let inKeyPlayers = false;
        let inCampanha = false;
        let currentCampanhaChannel = null;

        for (const line of lines) {
             // Tratamento de key_players (igual)
             if (line.trim() === 'key_players:') { inKeyPlayers = true; inCampanha = false; continue; }
             if (inKeyPlayers) { /* ... (código igual) ... */ }
               if (line.match(/^\w+:/)) {
                    inKeyPlayers = false;
                } else {
                    const nomeMatch = line.match(/^\s*-\s*nome:\s*"?([^"]*)"?\s*$/);
                    const roleMatch = line.match(/^\s*role:\s*"?([^"]*)"?\s*$/);
                    const positionMatch = line.match(/^\s*position:\s*"?([^"]*)"?\s*$/);
                    if (nomeMatch) keyPlayersData.push({ nome: nomeMatch[1] });
                    else if (roleMatch && keyPlayersData.length > 0) keyPlayersData[keyPlayersData.length - 1].role = roleMatch[1];
                    else if (positionMatch && keyPlayersData.length > 0) keyPlayersData[keyPlayersData.length - 1].position = positionMatch[1];
                    continue;
                }


             // --- NOVA LÓGICA: Tratamento de campanha ---
            if (line.trim() === 'campanha:') {
                inCampanha = true;
                inKeyPlayers = false; // Garante que saiu de key_players
                inMultiline = false; // Garante que saiu de multiline
                campanhaData = {}; // Inicia objeto da campanha
                continue;
            }
             if (inCampanha) {
                 // Detecta novo canal (email, whatsapp, instagram)
                 const channelMatch = line.match(/^ {2}(\w+):$/); // 2 espaços de indentação
                 if (channelMatch) {
                     currentCampanhaChannel = channelMatch[1];
                     campanhaData[currentCampanhaChannel] = {};
                     inMultiline = false; // Reseta multiline ao mudar de canal
                     continue;
                 }

                 // Detecta subchave dentro do canal (assunto, mensagem_oposicao, etc.)
                 if (currentCampanhaChannel) {
                     const subKeyMatchPipe = line.match(/^ {4}(\w+):\s*\|/); // 4 espaços + pipe
                     const subKeyMatchSimple = line.match(/^ {4}(\w+):\s*(.+)$/); // 4 espaços + valor simples

                     if (subKeyMatchPipe) {
                         currentKey = subKeyMatchPipe[1];
                         inMultiline = true;
                         multilineValue = '';
                         continue;
                     } else if (inMultiline) {
                         // Coleta linhas multiline da campanha
                         if (line.match(/^ {4}\w+:/) || line.match(/^ {2}\w+:/) || line.match(/^\w+:/)) { // Detecta nova subchave, canal ou chave principal
                             campanhaData[currentCampanhaChannel][currentKey] = multilineValue.trim();
                             inMultiline = false;
                             // REPROCESSA a linha atual
                         } else {
                             multilineValue += line.replace(/^ {6}/, '') + '\n'; // Assume indentação de 6 espaços
                             continue;
                         }
                     }

                    if (!inMultiline && subKeyMatchSimple) { // Processa chave simples se não estiver em multiline
                        const subKey = subKeyMatchSimple[1];
                        const subValue = subKeyMatchSimple[2].replace(/^["']|["']$/g, '').trim();
                        campanhaData[currentCampanhaChannel][subKey] = subValue;
                        continue; // Próxima linha
                    }
                 }
                // Se não caiu em nenhum if de campanha e inCampanha é true,
                // pode ser o fim da seção campanha ou uma linha mal formatada.
                // Se encontrar uma chave principal, sai da campanha.
                if (line.match(/^\w+:/)) {
                     inCampanha = false;
                     // Salva a última multiline da campanha se houver
                     if (inMultiline && currentCampanhaChannel && currentKey) {
                        campanhaData[currentCampanhaChannel][currentKey] = multilineValue.trim();
                        inMultiline = false;
                     }
                     // REPROCESSA a linha atual fora da campanha
                } else {
                     continue; // Ignora linhas dentro de campanha que não reconhece
                }

            }
            // --- FIM DA NOVA LÓGICA DE CAMPANHA ---


            // Tratamento de Multiline Geral (fora de key_players e campanha)
             if (!inKeyPlayers && !inCampanha && line.includes('|') && !line.match(/^\s*-/)) { /* ... (código igual) ... */ }
             if (inMultiline) { /* ... (código igual, mas salva em pautaData) ... */ }
               if (line.includes('|') && !line.match(/^\s*-/)) {
                  const match = line.match(/^(\w+):\s*\|/);
                  if (match) {
                      currentKey = match[1];
                      inMultiline = true;
                      multilineValue = '';
                      continue;
                  }
               }
               if (inMultiline) {
                 if (line.match(/^\w+:/) && !line.includes('  ')) {
                    pautaData[currentKey] = multilineValue.trim();
                    inMultiline = false;
                } else {
                    multilineValue += line.replace(/^ {2}/, '') + '\n';
                    continue;
                }
               }


            // Tratamento de Campo Simples Geral (fora de key_players e campanha)
            const match = line.match(/^(\w+):\s*(.+)$/);
            if (match) { /* ... (código igual, mas salva em pautaData) ... */ }
             if (match) {
                const key = match[1];
                let value = match[2].replace(/^["']|["']$/g, '').trim();
                pautaData[key] = value;

                const input = document.getElementById(key);
                if (input) {
                    if (input.type === 'checkbox') input.checked = value === 'true';
                    else input.value = value;
                }
            }
        }
        // Salvar últimos multiline (geral ou campanha)
         if (inMultiline && currentKey) {
             if (inCampanha && currentCampanhaChannel) {
                 campanhaData[currentCampanhaChannel][currentKey] = multilineValue.trim();
             } else {
                 pautaData[currentKey] = multilineValue.trim();
             }
         }


        // Preencher body
        document.getElementById('body').value = body;

        // --- NOVA LÓGICA: Preencher Campos das Campanhas ---
        document.getElementById('campaign-message-opposition').value =
            campanhaData.email?.mensagem_oposicao || // Tenta pegar do email primeiro
            campanhaData.whatsapp?.mensagem_oposicao ||
            campanhaData.instagram?.mensagem_oposicao || '';

        document.getElementById('campaign-message-support').value =
            campanhaData.email?.mensagem_apoio ||
            campanhaData.whatsapp?.mensagem_apoio ||
            campanhaData.instagram?.mensagem_apoio || '';

        if (campanhaData.email) {
            document.getElementById('enable-campaign-email').checked = true;
            document.getElementById('email-assunto').value = campanhaData.email.assunto || '';
            document.getElementById('campaign-message-email-extra').value = campanhaData.email.mensagem_extra || '';
            toggleCampaignChannel('email'); // Mostra a seção de email
        }
        if (campanhaData.whatsapp) {
            document.getElementById('enable-campaign-whatsapp').checked = true;
            toggleCampaignChannel('whatsapp');
        }
        if (campanhaData.instagram) {
            document.getElementById('enable-campaign-instagram').checked = true;
            toggleCampaignChannel('instagram');
        }
        // --- FIM DA NOVA LÓGICA ---


        // Recarregar Membros-Chave (como na versão anterior)
        if (keyPlayersData.length > 0) { /* ... (código igual) ... */ }
         if (keyPlayersData.length > 0) {
            listaParl.innerHTML = '';
            keyPlayersData.forEach(player => {
                const parlamentar = deputados.find(d => d.nome === player.nome);
                if (parlamentar) {
                    parlamentarCount++;
                    const item = document.createElement('div');
                    item.className = 'parlamentar-item';
                    item.id = `parl-${parlamentarCount}`;
                    const deputadoData = JSON.stringify({...}).replace(/'/g, "&apos;");
                    item.innerHTML = `... (código igual para criar o item) ...`;
                     const deputadoDataJSON = JSON.stringify({
                        id: parlamentar.id, nome: parlamentar.nome, partido: parlamentar.partido, uf: parlamentar.uf
                     }).replace(/'/g, "&apos;"); // Escapa apóstrofos para HTML

                     item.innerHTML = `
                        <div class="parlamentar-item-info">
                            <strong>${parlamentar.nome}</strong> (${parlamentar.partido}-${parlamentar.uf})
                            <div class="parlamentar-item-inputs">
                                <input type="text" class="parl-role" placeholder="Função/Papel (Opcional)" value="${player.role || ''}" data-deputado='${deputadoDataJSON}'>
                                <select class="parl-position" data-deputado-id="${parlamentar.id}">
                                    <option value="nao-manifestado" ${(!player.position || player.position === 'nao-manifestado') ? 'selected' : ''}>Posição: Não se manifestou</option>
                                    <option value="contrario" ${player.position === 'contrario' ? 'selected' : ''}>Posição: Contrário</option>
                                    <option value="apoia" ${player.position === 'apoia' ? 'selected' : ''}>Posição: Apoia</option>
                                </select>
                            </div>
                        </div>
                        <button type="button" class="btn btn-small btn-danger" onclick="document.getElementById('parl-${parlamentarCount}').remove()">🗑️ Remover</button>
                    `;

                    listaParl.appendChild(item);
                } else {
                    console.warn(`Membro-chave "${player.nome}" não encontrado na lista de parlamentares.`);
                }
            });
        }


        // Atualizar UI (como antes)
        handlePlenaryVoteChange();
        showTab('criar');
        // ... (resto do código igual: adicionar alerta, alterar botão, scroll) ...
         const titleInput = document.getElementById('title');
         if (titleInput && titleInput.parentElement) {
             titleInput.parentElement.insertAdjacentHTML('beforebegin', '<div class="alert alert-warning" id="edit-mode" ...>...</div>');
         }
         const submitBtn = document.querySelector('#pautaForm button[type="submit"]');
          if (submitBtn) {
            submitBtn.textContent = '💾 Salvar Alterações';
            submitBtn.setAttribute('data-editing', filename);
            const newBtn = submitBtn.cloneNode(true);
            submitBtn.parentNode.replaceChild(newBtn, submitBtn);
            newBtn.addEventListener('click', function(event) { /* ... */ });
             newBtn.addEventListener('click', function(event) {
                event.preventDefault();
                const editingFilename = this.getAttribute('data-editing');
                if (editingFilename) {
                    salvarAlteracoes(editingFilename);
                }
            });
         }
         setTimeout(() => { titleInput?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 300);


        console.log('✅ Formulário preenchido com sucesso, incluindo key_players e nova campanha.');

    } catch (error) {
        console.error('❌ Erro ao carregar pauta para edição:', error);
        alert('❌ Erro ao carregar pauta: ' + error.message);
        document.getElementById('pautaForm').reset(); // Reseta em caso de erro
        showTab('gerenciar');
    }
}

// Função para salvar alterações na pauta
async function salvarAlteracoes(filename) {
  try {
    // Coletar dados do formulário (similar a gerarPauta)
    const pautaContent = coletarDadosFormulario();

    const response = await fetch(`/api/edit-pauta`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ filename, content: pautaContent }),
    });

    const data = await response.json();

    if (data.success) {
      alert("✅ Pauta atualizada com sucesso!");
      location.reload();
    } else {
      alert("❌ Erro: " + data.error);
    }
  } catch (error) {
    console.error("Erro ao salvar alterações:", error);
    alert("❌ Erro ao salvar: " + error.message);
  }
}

// Carregar congressistas extras
async function carregarCongressistas() {
  try {
    const response = await fetch(`/api/congressistas`);
    const data = await response.json();
    congressistasExtras = data.congressistas || {};
    renderDados();
  } catch (error) {
    console.error("Erro ao carregar congressistas:", error);
  }
}

// ==========================================
// CARREGAR E RENDERIZAR CONTRIBUIÇÕES
// ==========================================

// Carregar contribuições (PRs com dados de contato)
async function carregarContribuicoes() {
  try {
    document.getElementById("loadingContribuicoes").classList.remove("hidden");

    const response = await fetch(`/api/contribuicoes-pendentes`, {
      cache: "no-cache",
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    const data = await response.json();

    console.log("📥 Contribuições recebidas:", data);

    // Verificar se são PRs (dados de contato) ou contribuições de conteúdo
    contribuicoesPendentes = data.contribuicoes || [];

    document.getElementById("loadingContribuicoes").classList.add("hidden");

    if (contribuicoesPendentes.length === 0) {
      document.getElementById("semContribuicoes").classList.remove("hidden");
      document.getElementById("contribuicoesLista").innerHTML = "";
    } else {
      document.getElementById("semContribuicoes").classList.add("hidden");
      renderContribuicoes();
    }
  } catch (error) {
    console.error("❌ Erro ao carregar contribuições:", error);
    document.getElementById("loadingContribuicoes").className = "loading error";
    document.getElementById("loadingContribuicoes").innerHTML =
      "<span>❌ Erro ao carregar</span>";
  }
}

// Renderizar contribuições
function renderContribuicoes() {
  const lista = document.getElementById("contribuicoesLista");

  lista.innerHTML = contribuicoesPendentes
    .map((contrib, index) => {
      // Verificar tipo de contribuição
      if (contrib.dados_contato || contrib.evidencia) {
        // Contribuição de DADOS (PR)
        return renderContribuicaoDados(contrib, index);
      } else {
        // Contribuição de CONTEÚDO (YAML)
        return renderContribuicaoConteudo(contrib, index);
      }
    })
    .join("");
}

// Renderizar contribuição de DADOS (PR - WhatsApp, Instagram, etc)
function renderContribuicaoDados(contrib, index) {
  let dadosHtml = "";

  if (contrib.dados_contato) {
    dadosHtml +=
      '<div style="margin-bottom: 15px;"><strong>📞 Dados de Contato:</strong><br>';

    if (contrib.dados_contato.whatsapp) {
      dadosHtml += `
                <div class="checkbox-item" id="check-whatsapp-${index}">
                    <input type="checkbox" onchange="toggleCheck('check-whatsapp-${index}')">
                    <span>WhatsApp: ${contrib.dados_contato.whatsapp}</span>
                </div>`;
    }

    if (contrib.dados_contato.instagram) {
      dadosHtml += `
                <div class="checkbox-item" id="check-instagram-${index}">
                    <input type="checkbox" onchange="toggleCheck('check-instagram-${index}')">
                    <span>Instagram: ${contrib.dados_contato.instagram}</span>
                </div>`;
    }

    if (contrib.dados_contato.telefone_gabinete) {
      dadosHtml += `
                <div class="checkbox-item" id="check-telefone-${index}">
                    <input type="checkbox" onchange="toggleCheck('check-telefone-${index}')">
                    <span>Tel. Gabinete: ${contrib.dados_contato.telefone_gabinete}</span>
                </div>`;
    }

    if (
      contrib.dados_contato.assessores &&
      contrib.dados_contato.assessores.length > 0
    ) {
      contrib.dados_contato.assessores.forEach((ass, i) => {
        dadosHtml += `
                    <div class="checkbox-item" id="check-assessor-${index}-${i}">
                        <input type="checkbox" onchange="toggleCheck('check-assessor-${index}-${i}')">
                        <span>Assessor: ${ass.nome} (${ass.whatsapp})</span>
                    </div>`;
      });
    }

    dadosHtml += "</div>";
  }

  if (contrib.evidencia) {
    dadosHtml += `
            <div style="margin-bottom: 15px;"><strong>📄 Evidência:</strong><br>
                <div class="checkbox-item" id="check-evidencia-${index}">
                    <input type="checkbox" onchange="toggleCheck('check-evidencia-${index}')">
                    <span>${contrib.evidencia.tipo}: <a href="${contrib.evidencia.url}" target="_blank">${contrib.evidencia.url}</a></span>
                </div>
            </div>`;
  }

  return `
        <div class="contribuicao-card">
            <div class="contribuicao-header">
                <div>
                    <h4>${contrib.parlamentar_nome || "Parlamentar"}</h4>
                    <small style="color: #666;">ID: ${
                      contrib.parlamentar_id || "N/A"
                    } | Pauta: ${contrib.pauta_slug || "N/A"}</small><br>
                    <small style="color: #666;">Enviado por: ${
                      contrib.usuario_nome || "Anônimo"
                    } em ${new Date(contrib.criado_em).toLocaleDateString(
    "pt-BR"
  )}</small>
                </div>
                ${
                  contrib.pr_url
                    ? `<a href="${contrib.pr_url}" target="_blank" class="btn btn-small">Ver PR</a>`
                    : ""
                }
            </div>
            
            ${dadosHtml}
            
            <div style="margin-top: 20px; display: flex; gap: 10px;">
                <button class="btn" onclick="aprovarSelecionados(${
                  contrib.pr_number || 0
                }, ${index})">✅ Aprovar Selecionados</button>
                <button class="btn btn-secondary" onclick="selecionarTodos(${index})">☑️ Selecionar Todos</button>
                <button class="btn btn-danger" onclick="rejeitarContribuicao(${
                  contrib.pr_number || 0
                })">❌ Rejeitar Tudo</button>
            </div>
        </div>`;
}

// Renderizar contribuição de CONTEÚDO (sugestão, correção)
function renderContribuicaoConteudo(contrib, index) {
  const tipoLabels = {
    sugestao: "Sugestão",
    correcao: "Correção",
    apoio: "Apoio",
    outro: "Outro",
  };

  const tipoBadges = {
    sugestao: "primary",
    correcao: "warning",
    apoio: "success",
    outro: "secondary",
  };

  const tipoLabel =
    tipoLabels[contrib.tipo] || contrib.tipo || "Não especificado";
  const tipoBadge = tipoBadges[contrib.tipo] || "secondary";
  const dataFormatada = contrib.data
    ? new Date(contrib.data).toLocaleString("pt-BR")
    : "Data inválida";

  return `
        <div class="contribuicao-card">
            <div class="contribuicao-header">
                <div>
                    <h4>📝 ${contrib.nome || "Anônimo"}</h4>
                    <span class="badge badge-${tipoBadge}" style="margin-left:10px;">${tipoLabel}</span>
                </div>
            </div>
            
            <div style="margin-bottom:15px;">
                <p style="margin:5px 0;"><strong>Pauta:</strong> ${
                  contrib.pauta_title ||
                  contrib.pauta_slug ||
                  "Não especificada"
                }</p>
                <p style="margin:5px 0;"><strong>Email:</strong> ${
                  contrib.email || "Não fornecido"
                }</p>
                <p style="margin:5px 0;"><strong>Data:</strong> ${dataFormatada}</p>
                <p style="margin:5px 0;"><strong>ID:</strong> <code>${
                  contrib.id || "N/A"
                }</code></p>
            </div>
            
            <div style="background:#f8f9fa;padding:15px;border-radius:5px;margin-bottom:15px;">
                <strong>Conteúdo:</strong>
                <p style="margin-top:8px;white-space:pre-wrap;">${
                  contrib.conteudo || "Sem conteúdo"
                }</p>
            </div>
            
            <div style="display:flex;gap:10px;justify-content:flex-end;">
                <button class="btn btn-success" onclick="aprovarContribuicaoConteudo('${
                  contrib.id
                }', '${contrib.pauta_slug}')">
                    ✅ Aprovar e Adicionar à Pauta
                </button>
                <button class="btn btn-danger" onclick="rejeitarContribuicaoConteudo('${
                  contrib.id
                }')">
                    ❌ Rejeitar
                </button>
            </div>
        </div>`;
}

// Toggle checkbox visual
function toggleCheck(elementId) {
  const element = document.getElementById(elementId);
  const checkbox = element.querySelector('input[type="checkbox"]');

  if (checkbox.checked) {
    element.classList.add("checked");
  } else {
    element.classList.remove("checked");
  }
}

// Selecionar todos os checkboxes de uma contribuição
function selecionarTodos(index) {
  const checkboxes = document.querySelectorAll(
    `[id^="check-"][id*="${index}"] input[type="checkbox"]`
  );
  const todosChecked = Array.from(checkboxes).every((cb) => cb.checked);

  checkboxes.forEach((cb) => {
    cb.checked = !todosChecked;
    toggleCheck(cb.parentElement.id);
  });
}

// Aprovar itens selecionados de uma contribuição de DADOS
async function aprovarSelecionados(prNumber, index) {
  const contrib = contribuicoesPendentes[index];

  if (!contrib || !contrib.dados_contato) {
    alert("❌ Contribuição inválida");
    return;
  }

  // Coletar itens selecionados
  const itensSelecionados = {
    whatsapp: null,
    instagram: null,
    telefone_gabinete: null,
    assessores: [],
    evidencias: [],
  };

  // WhatsApp
  const checkWhatsApp = document.getElementById(`check-whatsapp-${index}`);
  if (checkWhatsApp && checkWhatsApp.querySelector("input").checked) {
    itensSelecionados.whatsapp = contrib.dados_contato.whatsapp;
  }

  // Instagram
  const checkInstagram = document.getElementById(`check-instagram-${index}`);
  if (checkInstagram && checkInstagram.querySelector("input").checked) {
    itensSelecionados.instagram = contrib.dados_contato.instagram;
  }

  // Telefone
  const checkTelefone = document.getElementById(`check-telefone-${index}`);
  if (checkTelefone && checkTelefone.querySelector("input").checked) {
    itensSelecionados.telefone_gabinete =
      contrib.dados_contato.telefone_gabinete;
  }

  // Assessores
  if (contrib.dados_contato.assessores) {
    contrib.dados_contato.assessores.forEach((ass, i) => {
      const checkAssessor = document.getElementById(
        `check-assessor-${index}-${i}`
      );
      if (checkAssessor && checkAssessor.querySelector("input").checked) {
        itensSelecionados.assessores.push(ass);
      }
    });
  }

  // Evidência
  const checkEvidencia = document.getElementById(`check-evidencia-${index}`);
  if (
    checkEvidencia &&
    checkEvidencia.querySelector("input").checked &&
    contrib.evidencia
  ) {
    itensSelecionados.evidencias.push(contrib.evidencia);
  }

  // Verificar se pelo menos um item foi selecionado
  const temSelecionados =
    itensSelecionados.whatsapp ||
    itensSelecionados.instagram ||
    itensSelecionados.telefone_gabinete ||
    itensSelecionados.assessores.length > 0 ||
    itensSelecionados.evidencias.length > 0;

  if (!temSelecionados) {
    alert("⚠️ Selecione pelo menos um item para aprovar!");
    return;
  }

  // Confirmar
  let mensagem = "✅ Deseja aprovar os seguintes itens?\n\n";
  if (itensSelecionados.whatsapp)
    mensagem += `• WhatsApp: ${itensSelecionados.whatsapp}\n`;
  if (itensSelecionados.instagram)
    mensagem += `• Instagram: ${itensSelecionados.instagram}\n`;
  if (itensSelecionados.telefone_gabinete)
    mensagem += `• Telefone: ${itensSelecionados.telefone_gabinete}\n`;
  if (itensSelecionados.assessores.length > 0) {
    mensagem += `• ${itensSelecionados.assessores.length} assessor(es)\n`;
  }
  if (itensSelecionados.evidencias.length > 0) {
    mensagem += `• ${itensSelecionados.evidencias.length} evidência(s)\n`;
  }
  mensagem += "\n⚠️ Se o dado já existir, será substituído ou adicionado.";

  if (!confirm(mensagem)) {
    return;
  }

  try {
    console.log("✅ Aprovando itens:", itensSelecionados);

    // Enviar para API
    const response = await fetch(`/api/contribuicoes-pendentes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        action: "approve_partial",
        pr_number: prNumber,
        parlamentar_id: contrib.parlamentar_id,
        itens: itensSelecionados,
      }),
    });

    const data = await response.json();

    if (data.success) {
      alert("✅ Itens aprovados com sucesso!");
      carregarContribuicoes(); // Recarregar lista
    } else {
      throw new Error(data.error || "Erro desconhecido");
    }
  } catch (error) {
    console.error("❌ Erro ao aprovar:", error);
    alert("❌ Erro ao aprovar itens: " + error.message);
  }
}

// Rejeitar contribuição de DADOS (PR inteiro)
async function rejeitarContribuicao(prNumber) {
  if (
    !confirm(
      "❌ Deseja rejeitar toda esta contribuição?\n\nO Pull Request será fechado e nenhum dado será adicionado."
    )
  ) {
    return;
  }

  try {
    const response = await fetch(`/api/contribuicoes-pendentes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        action: "reject",
        pr_number: prNumber,
      }),
    });

    const data = await response.json();

    if (data.success) {
      alert("✅ Contribuição rejeitada!");
      carregarContribuicoes();
    } else {
      throw new Error(data.error || "Erro desconhecido");
    }
  } catch (error) {
    console.error("❌ Erro ao rejeitar:", error);
    alert("❌ Erro: " + error.message);
  }
}

// Aprovar contribuição de CONTEÚDO
async function aprovarContribuicaoConteudo(id, pautaSlug) {
  alert(
    '⚠️ Funcionalidade em desenvolvimento!\n\nPor enquanto:\n1. Copie o conteúdo da contribuição\n2. Vá em "Gerenciar Pautas"\n3. Clique em "Alterar" na pauta correspondente\n4. Adicione o conteúdo manualmente\n5. Volte aqui e rejeite a contribuição'
  );
}

// Rejeitar contribuição de CONTEÚDO
async function rejeitarContribuicaoConteudo(id) {
  if (
    !confirm(
      "❌ Deseja rejeitar esta contribuição?\n\nEla será removida permanentemente."
    )
  ) {
    return;
  }

  try {
    // TODO: Implementar API para remover do YAML
    alert("⚠️ Funcionalidade em desenvolvimento!");
  } catch (error) {
    console.error("❌ Erro:", error);
    alert("❌ Erro: " + error.message);
  }
}

// Render dados cadastrados
function renderDados() {
  const lista = document.getElementById("dadosLista");
  document.getElementById("loadingDados").classList.add("hidden");

  const entries = Object.entries(congressistasExtras);

  if (entries.length === 0) {
    lista.innerHTML =
      '<p style="grid-column: 1/-1; text-align: center; color: #999;">Nenhum dado cadastrado ainda.</p>';
    return;
  }

  lista.innerHTML = entries
    .map(([id, dados]) => {
      const parlamentar = deputados.find((d) => d.id === id);
      const nome = parlamentar ? parlamentar.nome : `ID: ${id}`;

      let infos = [];
      if (dados.whatsapp) infos.push(`📱 ${dados.whatsapp}`);
      if (dados.instagram) infos.push(`📷 @${dados.instagram}`);
      if (dados.telefone_gabinete) infos.push(`📞 ${dados.telefone_gabinete}`);
      if (dados.assessores)
        infos.push(`👥 ${dados.assessores.length} assessor(es)`);

      return `<div class="card">
            <div class="card-title">${nome}</div>
            <div class="card-info">
                ${infos.join("<br>")}
                <br><small>Atualizado: ${
                  dados.ultima_atualizacao || "N/A"
                }</small>
            </div>
            <div class="card-actions">
                <button class="btn btn-small btn-warning" onclick="editarDados('${id}', '${nome}')">✏️ Editar</button>
                <button class="btn btn-small btn-danger" onclick="excluirDados('${id}', '${nome}')">🗑️ Excluir</button>
            </div>
        </div>`;
    })
    .join("");
}

function filtrarDados() {
  const query = document.getElementById("searchDados").value.toLowerCase();
  const cards = document.querySelectorAll("#dadosLista .card");

  cards.forEach((card) => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(query) ? "block" : "none";
  });
}

// Função para editar dados cadastrados
function editarDados(id, nome) {
  // Obter dados atuais
  const dadosAtuais = congressistasExtras[id] || {};

  // Criar formulário de edição
  const formHtml = `
        <div style="background: white; padding: 20px; border-radius: 8px; max-width: 500px; margin: 0 auto;">
            <h3>Editar Dados de ${nome}</h3>
            <form id="editDadosForm">
                <div class="form-group">
                    <label>Email:</label>
                    <input type="email" id="edit-email" value="${
                      dadosAtuais.email || ""
                    }" 
                           placeholder="exemplo@email.com">
                </div>
                <div class="form-group">
                    <label>Telefone:</label>
                    <input type="text" id="edit-telefone" value="${
                      dadosAtuais.telefone || ""
                    }" 
                           placeholder="(61) 99999-9999">
                </div>
                <div class="form-group">
                    <label>WhatsApp:</label>
                    <input type="text" id="edit-whatsapp" value="${
                      dadosAtuais.whatsapp || ""
                    }" 
                           placeholder="(61) 99999-9999">
                </div>
                <div class="form-group">
                    <label>Instagram:</label>
                    <input type="text" id="edit-instagram" value="${
                      dadosAtuais.instagram || ""
                    }" 
                           placeholder="@usuario">
                </div>
                <div class="form-group">
                    <label>Twitter/X:</label>
                    <input type="text" id="edit-twitter" value="${
                      dadosAtuais.twitter || ""
                    }" 
                           placeholder="@usuario">
                </div>
                <div class="form-group">
                    <label>Facebook:</label>
                    <input type="text" id="edit-facebook" value="${
                      dadosAtuais.facebook || ""
                    }" 
                           placeholder="usuario ou URL">
                </div>
                <div class="form-group">
                    <label>Website:</label>
                    <input type="url" id="edit-website" value="${
                      dadosAtuais.website || ""
                    }" 
                           placeholder="https://exemplo.com">
                </div>
            </form>
        </div>
    `;

  // Criar modal
  const modal = document.createElement("div");
  modal.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;";
  modal.innerHTML = formHtml;

  // Adicionar botões
  const buttonsDiv = document.createElement("div");
  buttonsDiv.style.cssText =
    "display:flex;gap:10px;margin-top:20px;justify-content:center;";
  buttonsDiv.innerHTML = `
        <button onclick="salvarEdicaoDados('${id}', '${nome}')" class="btn btn-success">💾 Salvar</button>
        <button onclick="this.closest('div[style*=position]').remove()" class="btn btn-secondary">Cancelar</button>
    `;
  modal.querySelector("div").appendChild(buttonsDiv);

  document.body.appendChild(modal);
}

// Função para salvar edição de dados
async function salvarEdicaoDados(id, nome) {
  try {
    const dados = {
      email: document.getElementById("edit-email").value,
      telefone: document.getElementById("edit-telefone").value,
      whatsapp: document.getElementById("edit-whatsapp").value,
      instagram: document.getElementById("edit-instagram").value,
      twitter: document.getElementById("edit-twitter").value,
      facebook: document.getElementById("edit-facebook").value,
      website: document.getElementById("edit-website").value,
      ultima_atualizacao: new Date().toISOString(),
    };

    // Remover campos vazios
    Object.keys(dados).forEach((key) => {
      if (!dados[key]) delete dados[key];
    });

    const response = await fetch(`/api/congressistas`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ parlamentarId: id, nome, dados }),
    });

    const result = await response.json();

    if (result.success) {
      alert("✅ Dados atualizados com sucesso!");
      // Remover modal
      document.querySelector('div[style*="position:fixed"]').remove();
      // Recarregar dados
      carregarDados();
    } else {
      alert("❌ Erro ao salvar: " + result.error);
    }
  } catch (error) {
    alert("❌ Erro ao salvar: " + error.message);
  }
}
async function excluirDados(parlamentarId, nome) {
  if (!confirm(`Tem certeza que deseja excluir todos os dados de ${nome}?`))
    return;

  try {
    const response = await fetch(`/api/congressistas`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ parlamentar_id: parlamentarId }),
    });

    const data = await response.json();

    if (data.success) {
      alert("✅ Dados excluídos!");
      carregarCongressistas();
    } else {
      alert("❌ Erro: " + data.message); // <-- ERRO CORRIGIDO AQUI
    }
  } catch (error) {
    alert("❌ Erro: " + error.message);
  }
}

// Estatísticas
async function atualizarEstatisticas() {
  document.getElementById("stat-total-pautas").textContent =
    pautas.length || "0";
  document.getElementById("stat-total-contribuicoes").textContent =
    contribuicoesPendentes.length || "0";
  document.getElementById("stat-total-dados").textContent =
    Object.keys(congressistasExtras).length || "0";

  try {
    const response = await fetch(`/api/evidencias`);
    const data = await response.json();
    let totalEvidencias = 0;
    if (data.pautas) {
      Object.values(data.pautas).forEach((pauta) => {
        totalEvidencias += Object.keys(pauta).length;
      });
    }
    document.getElementById("stat-total-evidencias").textContent =
      totalEvidencias;
  } catch (error) {
    console.error("Erro ao contar evidências:", error);
  }
}

// Handler para mudança no checkbox de votação em plenário

function handlePlenaryVoteChange() {
  const isPlenaryVote = document.getElementById("is_plenary_vote").checked;
  const parlamentaresList = document.getElementById("parlamentaresList");
  const infoMembrosChave = document.getElementById("infoMembrosChave");
  const autocompleteInput = document.getElementById("autocomplete-input");
  const autocompleteList = document.getElementById("autocomplete-list");

  if (isPlenaryVote) {
    // Mostrar aviso, limpar lista, desativar busca (como antes)
    infoMembrosChave.classList.remove("hidden");
    parlamentaresList.innerHTML =
      '<p style="color: #28a745; text-align: center; font-weight: 600;">✅ Votação em Plenário: Todos os parlamentares serão incluídos automaticamente</p>';
    if (autocompleteInput) {
      autocompleteInput.disabled = true;
      autocompleteInput.placeholder = "Desativado (Votação em Plenário)";
      autocompleteInput.value = "";
    }
    if (autocompleteList) {
      autocompleteList.classList.remove("show");
    }
  } else {
    // Esconder aviso, resetar lista
    infoMembrosChave.classList.add("hidden");
    parlamentaresList.innerHTML =
      '<p style="color: #999; text-align: center;">Nenhum parlamentar adicionado</p>';

    // --- CORREÇÃO: Reativar busca e carregar dados se necessário ---
    if (autocompleteInput) {
      const casaSelecionada = document.getElementById("casa").value;
      // Só reativa se uma casa JÁ estiver selecionada
      autocompleteInput.disabled = !casaSelecionada;
      autocompleteInput.placeholder = "Digite o nome do parlamentar...";

      // Se a casa está selecionada mas os deputados não foram carregados, carrega agora
      if (casaSelecionada && deputados.length === 0) {
        loadDeputados();
      }
    }
    // --- FIM DA CORREÇÃO ---
  }
}

// Handler para mudança no checkbox de pauta principal
function handleFeaturedChange() {
  const isFeatured = document.getElementById("featured").checked;

  if (isFeatured) {
    const confirmar = confirm(
      "⚠️ ATENÇÃO: Esta pauta será marcada como PRINCIPAL.\n\n" +
        "Isso significa que:\n" +
        '✅ Ela aparecerá destacada na página inicial com o texto "Nossa luta principal é"\n' +
        "⚠️ Qualquer outra pauta que estiver marcada como principal perderá esse status\n\n" +
        "Deseja continuar?"
    );

    if (!confirmar) {
      document.getElementById("featured").checked = false;
    }
  }
}

// Abrir modal de autocomplete (Função antiga removida, pois agora é inline)

// Selecionar parlamentar do autocomplete (NOVA VERSÃO COM INPUTS)
function selecionarParlamentar(id, nome, partido, uf) {
  // 1. Fechar a lista de autocomplete (usando JavaScript puro)
  const autocompleteList = document.getElementById("autocomplete-list");
  if (autocompleteList) {
    autocompleteList.classList.remove("show");
  }

  // 2. Limpar o campo de busca
  const autocompleteInput = document.getElementById("autocomplete-input");
  if (autocompleteInput) {
    autocompleteInput.value = "";
  }

  // 3. Adicionar o parlamentar à lista
  parlamentarCount++;
  const lista = document.getElementById("parlamentaresList");

  // Limpar a mensagem "Nenhum parlamentar adicionado" se ela existir
  if (lista.querySelector("p")) {
    lista.innerHTML = "";
  }

  // 4. Criar o novo item da lista com os inputs
  const item = document.createElement("div");
  item.className = "parlamentar-item";
  item.id = `parl-${parlamentarCount}`;

  // Armazena os dados do deputado em formato JSON (seguro para HTML)
  const deputadoData = JSON.stringify({ id, nome, partido, uf }).replace(
    /'/g,
    "&apos;"
  );

  item.innerHTML = `
        <div class="parlamentar-item-info">
            <strong>${nome}</strong> (${partido}-${uf})
            
            <div class="parlamentar-item-inputs">
                <input 
                    type="text" 
                    class="parl-role" 
                    placeholder="Função/Papel (Opcional, Ex: Relator)" 
                    data-deputado='${deputadoData}'
                >
                
                <select class="parl-position" data-deputado-id="${id}">
                    <option value="nao-manifestado" selected>Posição: Não se manifestou</option>
                    <option value="contrario">Posição: Contrário</option>
                    <option value="apoia">Posição: Apoia</option>
                </select>
            </div>
        </div>
        <button 
            type="button" 
            class="btn btn-small btn-danger" 
            onclick="document.getElementById('parl-${parlamentarCount}').remove()">
            🗑️ Remover
        </button>
    `;

  lista.appendChild(item);
}

// Fechar autocomplete ao clicar fora
document.addEventListener("click", function (e) {
  const list = document.getElementById("autocomplete-list");
  const input = document.getElementById("autocomplete-input");
  if (list && !list.contains(e.target) && e.target !== input) {
    list.classList.remove("show");
  }
});

// ==========================================
// GERAR/SALVAR PAUTA (LÓGICA CENTRALIZADA)
// ==========================================


// Gerar Pauta (Função principal de submit)
async function gerarPauta(e) {
  e.preventDefault();

  const btnSubmit = e.target.querySelector('button[type="submit"]');
  const btnText = btnSubmit.innerHTML;
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = "⏳ Criando pauta...";

  try {
    // 1. Coletar dados
    const yaml = coletarDadosFormulario();
    const title = document.getElementById("title").value;
    const filename = slugify(title) + ".md";
    const featured = document.getElementById("featured").checked;
    const isPlenaryVote = document.getElementById("is_plenary_vote").checked;

    // 2. CRIAR AUTOMATICAMENTE NO GITHUB
    const response = await fetch(`/api/criar-pauta`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ filename, content: yaml }),
    });

    const data = await response.json();

    if (data.success) {
      document.getElementById("codeOutput").textContent = yaml;
      document.getElementById("filenameOutput").textContent = filename;
      document.getElementById("outputCriar").classList.remove("hidden");

      let alertMsg = `✅ Pauta criada com sucesso!\n\n📄 Arquivo: ${filename}\n🔗 GitHub: ${data.url}\n🌐 Site: ${data.site_url}`;

      if (featured) {
        alertMsg +=
          "\n\n⭐ PAUTA PRINCIPAL: Esta pauta aparecerá destacada na página inicial!";
      }

      if (isPlenaryVote) {
        alertMsg +=
          "\n\n🏛️ VOTAÇÃO EM PLENÁRIO: Todos os parlamentares estarão incluídos automaticamente na mobilização!";
      }

      alertMsg += "\n\nAguarde 2-5 minutos para o deploy completar.";

      alert(alertMsg);

      document.getElementById("pautaForm").reset();
      document.getElementById("parlamentaresList").innerHTML =
        '<p style="color: #999; text-align: center;">Nenhum parlamentar adicionado</p>';
      document.getElementById("infoMembrosChave").classList.add("hidden");

      document
        .getElementById("outputCriar")
        .scrollIntoView({ behavior: "smooth" });

      carregarPautas();
    } else {
      if (response.status === 409) {
        alert(
          `⚠️ ${data.error}\n\nArquivo: ${data.filename}\n\n${data.suggestion}`
        );
      } else {
        alert("❌ Erro ao criar pauta: " + (data.error || "Tente novamente"));
      }
    }
  } catch (error) {
    console.error("Erro:", error);
    alert("❌ Erro ao criar pauta: " + error.message);
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = btnText;
  }
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function copiarCodigo() {
  const code = document.getElementById("codeOutput").textContent;
  navigator.clipboard.writeText(code).then(() => {
    alert("✅ Código copiado!");
  });
}

function showTab(tabName, event) {
  // Remover classe active de todas as tabs
  document
    .querySelectorAll(".tab")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelectorAll(".tab-content")
    .forEach((t) => t.classList.remove("active"));

  // Adicionar classe active no botão clicado (se event existir)
  if (event && event.target) {
    event.target.classList.add("active");
  } else {
    // Se chamado programaticamente, encontrar o botão correto
    const tabButton = Array.from(document.querySelectorAll(".tab")).find(
      (tab) => {
        const onclick = tab.getAttribute("onclick");
        return onclick && onclick.includes(`'${tabName}'`);
      }
    );
    if (tabButton) {
      tabButton.classList.add("active");
    }
  }

  // Mostrar conteúdo da tab
  const tabContent = document.getElementById(`tab-${tabName}`);
  if (tabContent) {
    tabContent.classList.add("active");
  }

  // Executar ações específicas de cada tab
  if (tabName === "gerenciar") carregarPautas();
  if (tabName === "contribuicoes") carregarContribuicoes();
  if (tabName === "dados") renderDados();
  if (tabName === "estatisticas") atualizarEstatisticas();
}

// Inicializar
checkAuth();
