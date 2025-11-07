document.addEventListener("DOMContentLoaded", async () => {
  let parlamentares = [];
  let congressistasExtras = {};
  const instagramIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-instagram" viewBox="0 0 16 16" style="vertical-align: -0.125em; margin-right: 4px;">
    <path d="M8 0C5.829 0 5.556.01 4.703.048 3.85.088 3.269.222 2.76.42a3.917 3.917 0 0 0-1.417.923A3.927 3.927 0 0 0 .42 2.76C.222 3.268.087 3.85.048 4.7.01 5.555 0 5.827 0 8.001c0 2.172.01 2.444.048 3.297.04.852.174 1.433.372 1.942.205.526.478.972.923 1.417.444.445.89.719 1.416.923.51.198 1.09.333 1.942.372C5.555 15.99 5.827 16 8 16s2.444-.01 3.298-.048c.851-.04 1.434-.174 1.943-.372a3.916 3.916 0 0 0 1.416-.923c.445-.445.718-.891.923-1.417.197-.509.332-1.09.372-1.942C15.99 10.445 16 10.173 16 8s-.01-2.445-.048-3.299c-.04-.851-.175-1.433-.372-1.941a3.926 3.926 0 0 0-.923-1.417A3.911 3.911 0 0 0 13.24.42c-.51-.198-1.092-.333-1.943-.372C10.443.01 10.172 0 7.998 0h.003zm-.717 1.442h.718c2.136 0 2.389.007 3.232.046.78.035 1.204.166 1.486.275.373.145.64.319.92.599.28.28.453.546.598.92.11.281.24.705.275 1.485.039.843.047 1.096.047 3.231s-.008 2.389-.047 3.232c-.035.78-.166 1.203-.275 1.485a2.47 2.47 0 0 1-.599.919c-.28.28-.546.453-.92.598-.28.11-.704.24-1.485.276-.843.038-1.096.047-3.232.047s-2.39-.009-3.233-.047c-.78-.036-1.203-.166-1.485-.276a2.478 2.478 0 0 1-.92-.598 2.48 2.48 0 0 1-.6-.92c-.109-.281-.24-.705-.275-1.485-.038-.843-.046-1.096-.046-3.233 0-2.136.008-2.388.046-3.231.036-.78.166-1.204.276-1.486.145-.373.319-.64.599-.92.28-.28.546-.453.92-.598.282-.11.705-.24 1.485-.276.738-.034 1.024-.044 2.515-.045v.002zm4.988 1.328a.96.96 0 1 0 0 1.92.96.96 0 0 0 0-1.92zm-4.27 1.122a4.109 4.109 0 1 0 0 8.217 4.109 4.109 0 0 0 0-8.217zm0 1.441a2.667 2.667 0 1 1 0 5.334 2.667 2.667 0 0 1 0-5.334z"/>
  </svg>`;

  async function loadData() {
    try {
      const [parlamentaresRes, extrasRes] = await Promise.all([
        fetch("/parlamentares_cache.json"),
        fetch("/api/congressistas_extras.json"),
      ]);
      parlamentares = (await parlamentaresRes.json()).parlamentares;
      congressistasExtras = await extrasRes.json();
    } catch (error) {
      console.error("Erro ao carregar dados dos parlamentares:", error);
    }
  }

  async function embedInstagramPosts() {
    // Não usamos oEmbed do Instagram no client (bloqueado por CORS).
    // Em vez disso, exibimos um link direto para o post para o usuário abrir no Instagram.
    const postElements = document.querySelectorAll(".instagram-post");
    for (const el of postElements) {
      const postUrl = el.dataset.postUrl;
      if (postUrl) {
        // Mostrar um link simples e um botão de abrir
        el.innerHTML = `<div style="display:flex;gap:8px;align-items:center"><a href="${postUrl}" target="_blank" rel="noopener noreferrer">Ver post no Instagram</a><a class="btn btn-sm btn-outline-secondary" href="${postUrl}" target="_blank" rel="noopener noreferrer" style="margin-left:6px">Abrir</a></div>`;
      } else {
        el.innerHTML = "";
      }
    }
  }

  async function fetchAndRenderManifestacoes() {
    const container = document.getElementById("lista-manifestacoes");
    const loading = document.getElementById("manifestacoes-loading");
    // Prioriza a rota serverless `/api/manifestacoes`. Em seguida tenta JSON estático caso exista.
    const tryPaths = [
      "/api/manifestacoes",
      "/manifestacoes.json",
      "/manifestacoes",
      "../manifestacoes.json",
    ];
    let manifestacoes = null;
    let lastError = null;

    // Mostrar estado de carregamento
    if (loading)
      loading.innerHTML =
        '<div class="spinner"></div> Carregando manifestações...';

    for (const p of tryPaths) {
      try {
        const resp = await fetch(p, { cache: "no-cache" });
        if (!resp.ok) throw new Error(`status ${resp.status}`);
        const json = await resp.json();
        // Aceita arrays diretamente ou objeto com chave 'manifestacoes'
        if (Array.isArray(json)) manifestacoes = json;
        else if (Array.isArray(json.manifestacoes))
          manifestacoes = json.manifestacoes;
        else if (Array.isArray(json.data)) manifestacoes = json.data;
        else manifestacoes = json; // tentou interpretar
        break;
      } catch (e) {
        lastError = e;
        console.warn("Falha ao carregar manifestacoes em", p, e.message);
      }
    }

    // Limpar estado de carregamento
    if (loading) loading.innerHTML = "";

    if (
      !manifestacoes ||
      (Array.isArray(manifestacoes) && manifestacoes.length === 0)
    ) {
      if (lastError) {
        console.error("Erro ao buscar manifestações:", lastError);
        if (container)
          container.innerHTML =
            '<p class="text-danger">Erro ao carregar manifestações. Tente novamente mais tarde.</p>';
      } else {
        if (container)
          container.innerHTML =
            '<p class="text-muted">Nenhuma manifestação cadastrada ainda.</p>';
      }
      return;
    }

    // Normalizar caso venga como objeto com keys
    if (!Array.isArray(manifestacoes)) {
      // tentar extrair valores se for um objeto
      manifestacoes = Object.values(manifestacoes);
    }

    // Render
    const ul = document.createElement("ul");
    ul.className = "list-group";

    const parlamentaresSet = new Set();

    manifestacoes.forEach((m) => {
      const li = document.createElement("li");
      li.className = "list-group-item manifestacao-item";

      const parlamentar = m.parlamentar || m.nome || "Parlamentar";
      parlamentaresSet.add(parlamentar);

      const partido = m.partido || "";
      const uf = m.uf || "";
      const post_url = m.post_url || m.url || m.link || "";
      const mensagem = m.mensagem_agradecimento || m.mensagem || "";
      const data = m.data || m.criado_em || "";

      li.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <strong>${parlamentar}</strong>
            ${
              partido || uf
                ? `<small class="text-muted"> — ${partido}${
                    uf ? "-" + uf : ""
                  }</small>`
                : ""
            }
            <div class="instagram-post mt-2" data-post-url="${
              post_url || ""
            }"></div>
            ${mensagem ? `<p class="mt-2"><em>"${mensagem}"</em></p>` : ""}
            <small class="text-muted">${data}</small>
          </div>
          <div class="text-end">
            <button class="btn btn-outline-primary btn-agradecer" type="button" data-parlamentar="${escapeHtml(
              parlamentar
            )}" data-mensagem="${escapeHtml(
        mensagem || "Obrigado pelo apoio!"
      )}" data-post-url="${post_url || ""}">Agradecer</button>
          </div>
        </div>
      `;

      ul.appendChild(li);
    });

    if (container) {
      container.innerHTML = "";
      container.appendChild(ul);
    }

    // Inserir ícones nos botões
    document.querySelectorAll(".agradecer-icon-ig").forEach((span) => {
      span.innerHTML = instagramIcon;
    });

    // Popular select de parlamentares (únicos)
    const select = document.getElementById("public-parlamentar");
    if (select) {
      // limpar exceto primeira opção
      Array.from(select.querySelectorAll("option")).forEach((opt, idx) => {
        if (idx > 0) opt.remove();
      });
      parlamentaresSet.forEach((pName) => {
        const option = document.createElement("option");
        option.value = pName;
        option.textContent = pName;
        select.appendChild(option);
      });
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function setupAgradecerButtons() {
    document.querySelectorAll(".btn-agradecer").forEach((button) => {
      button.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        const parlamentarNome = btn.dataset.parlamentar;
        const mensagem = btn.dataset.mensagem;

        // 1. Copiar a mensagem para a área de transferência
        try {
          await navigator.clipboard.writeText(mensagem);
          // Alerta para o usuário que a mensagem foi copiada
          alert(
            "✅ Mensagem copiada!\n\nAgora você será redirecionado para o Instagram. Cole a mensagem no campo de comentário ou no Direct."
          );
        } catch (err) {
          console.error("Falha ao copiar a mensagem: ", err);
          // Fallback caso a cópia falhe
          alert(
            "Não foi possível copiar a mensagem automaticamente. Por favor, copie manualmente e cole no Instagram."
          );
        }

        // 2. Abrir o post no Instagram (lógica que já existia)

        // Tenta obter postUrl direto do botão, do elemento .instagram-post ou do primeiro link local ao item
        let postUrl = btn.dataset.postUrl || null;
        if (!postUrl) {
          const item = btn.closest(".manifestacao-item");
          if (item) {
            const postEl = item.querySelector(".instagram-post");
            if (postEl && postEl.dataset && postEl.dataset.postUrl)
              postUrl = postEl.dataset.postUrl || null;
            // fallback: procurar por um link do instagram no item
            if (!postUrl) {
              const link = item.querySelector('a[href*="instagram.com"]');
              if (link) postUrl = link.href;
            }
          }
        }

        // Buscar parlamentar nos dados locais para obter username
        const parlamentar = parlamentares.find(
          (p) => p.nome === parlamentarNome
        );
        const instagramUsername =
          parlamentar &&
          congressistasExtras[parlamentar.id] &&
          congressistasExtras[parlamentar.id].instagram
            ? congressistasExtras[parlamentar.id].instagram
            : null;

        try {
          await tryShareMessage(instagramUsername, mensagem, postUrl);
        } catch (err) {
          console.error("Erro no fluxo de compartilhamento:", err);
          if (typeof showToast === "function")
            showToast(
              "Erro ao tentar compartilhar a mensagem. Tente copiar manualmente.",
              "error"
            );
          else
            alert(
              "Erro ao tentar compartilhar a mensagem. Tente copiar manualmente."
            );
        }
      });
    });
  }

  // Tenta compartilhar a mensagem com a melhor UX disponível:
  // 1) Web Share API (mobile) 2) copiar para clipboard + abrir post/profile 3) fallback: alert com instruções
  async function tryShareMessage(instagramUsername, mensagem, postUrl) {
    // Normaliza postUrl: adiciona esquema se estiver ausente e trata paths relativos do Instagram
    function normalizePostUrl(url) {
      if (!url) return null;
      url = String(url).trim();
      if (!url) return null;
      if (/^\/\//.test(url)) return "https:" + url;
      if (/^https?:\/\//i.test(url)) return url;
      // caminho tipo /p/XYZ
      if (url.startsWith("/")) return "https://www.instagram.com" + url;
      // dominio sem esquema
      if (url.indexOf("instagram.com") !== -1) return "https://" + url;
      return url;
    }

    postUrl = normalizePostUrl(postUrl);
    // Verifica se é um dispositivo móvel para usar a API de compartilhamento
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);

    // Tenta Web Share API
    if (navigator.share && isMobile) {
      try {
        await navigator.share({
          title: `Agradecimento${
            instagramUsername ? " a " + instagramUsername : ""
          }`,
          text: mensagem,
          url: postUrl || window.location.href,
        });
        return; // usuário compartilhou ou fechou o sheet
      } catch (err) {
        // Pode ser cancelamento ou erro — seguimos para fallback
        console.warn("navigator.share falhou ou foi cancelado:", err);
      }
    }

    // Copiar para clipboard (tentativa)
    let copied = false;
    try {
      await navigator.clipboard.writeText(mensagem);
      copied = true;
    } catch (err) {
      console.warn("Não foi possível copiar automaticamente:", err);
      copied = false;
    }

    // Tenta abrir o post (melhor) ou perfil
    if (postUrl) {
      window.open(postUrl, "_blank");
      if (copied) {
        if (typeof showToast === "function")
          showToast(
            "Mensagem copiada. Abra o Instagram (post) e cole a mensagem para enviar.",
            "info"
          );
        else
          alert(
            "Mensagem copiada. Abra o Instagram (post) e cole a mensagem para enviar."
          );
      } else {
        if (typeof showToast === "function")
          showToast(
            "Abra o post no Instagram e cole sua mensagem para enviar.",
            "info"
          );
        else alert("Abra o post no Instagram e cole sua mensagem para enviar.");
      }
      return;
    }

    if (instagramUsername) {
      // Abrir perfil
      window.open(`https://www.instagram.com/${instagramUsername}/`, "_blank");
      if (copied) {
        if (typeof showToast === "function")
          showToast(
            "Perfil aberto. A mensagem foi copiada — cole no Direct para enviar.",
            "info"
          );
        else
          alert(
            "Perfil aberto. A mensagem foi copiada — cole no Direct para enviar."
          );
      } else {
        if (typeof showToast === "function")
          showToast(
            "Perfil aberto. Copie manualmente a mensagem e cole no Direct para enviar.",
            "info"
          );
        else
          alert(
            "Perfil aberto. Copie manualmente a mensagem e cole no Direct para enviar."
          );
      }
      return;
    }

    // Nenhum post/profile disponível — instruções finais
    if (copied) {
      if (typeof showToast === "function")
        showToast(
          "Mensagem copiada para a área de transferência. Abra o Instagram e cole a mensagem no Direct para enviar.",
          "info"
        );
      else
        alert(
          "Mensagem copiada para a área de transferência. Abra o Instagram e cole a mensagem no Direct para enviar."
        );
    } else {
      // último recurso: mostrar a mensagem em prompt para o usuário copiar
      window.prompt(
        "Copie esta mensagem e cole no Instagram Direct:",
        mensagem
      );
    }
  }

  await loadData();
  await fetchAndRenderManifestacoes();
  // Render de posts sem oEmbed (evita CORS)
  await embedInstagramPosts();
  setupAgradecerButtons();
  setupPublicForm();

  // Since Instagram embeds can be slow, we might need to re-run the script that processes them
  // after the embed script has loaded and rendered the iframe.
  setTimeout(() => {
    if (window.instgrm) {
      try {
        window.instgrm.Embeds.process();
      } catch (e) {
        // ignore
      }
    }
  }, 2000);
});

function setupPublicForm() {
  const form = document.getElementById("public-agradecimento-form");
  if (!form) return;

  const feedback = document.getElementById("public-agradecimento-feedback");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (feedback) {
      feedback.style.display = "none";
      feedback.className = "";
      feedback.textContent = "";
    }

    const nome = document.getElementById("public-nome")?.value?.trim();
    const email = document.getElementById("public-email")?.value?.trim();
    const parlamentar = document
      .getElementById("public-parlamentar")
      ?.value?.trim();
    const mensagem = document.getElementById("public-mensagem")?.value?.trim();
    const pauta_slug =
      document.getElementById("public-pauta-slug")?.value || "agradecimentos";

    if (!nome || !email || !parlamentar || !mensagem) {
      if (feedback) {
        feedback.style.display = "block";
        feedback.className = "text-danger";
        feedback.textContent = "Por favor, preencha todos os campos.";
      }
      return;
    }

    try {
      const payload = {
        pauta_slug,
        pauta_title: "Agradecimentos",
        nome,
        email,
        tipo: "apoio",
        conteudo: `Agradecimento para ${parlamentar}: ${mensagem}`,
      };

      const res = await fetch("/api/contribuicoes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        form.reset();
        if (feedback) {
          feedback.style.display = "block";
          feedback.className = "text-success";
          feedback.textContent =
            "✅ Obrigado! Sua mensagem foi enviada para revisão.";
        } else if (typeof showToast === "function") {
          showToast(
            "✅ Obrigado! Sua mensagem foi enviada para revisão.",
            "success"
          );
        } else {
          alert("✅ Obrigado! Sua mensagem foi enviada para revisão.");
        }
      } else {
        const msg =
          data?.error || data?.message || "Erro ao enviar a contribuição.";
        if (feedback) {
          feedback.style.display = "block";
          feedback.className = "text-danger";
          feedback.textContent = "❌ " + msg;
        } else {
          if (typeof showToast === "function") showToast("❌ " + msg, "error");
          else alert("❌ " + msg);
        }
      }
    } catch (err) {
      console.error("Erro ao enviar agradecimento:", err);
      if (feedback) {
        feedback.style.display = "block";
        feedback.className = "text-danger";
        feedback.textContent = "❌ Erro ao enviar. Tente novamente mais tarde.";
      } else if (typeof showToast === "function") {
        showToast("❌ Erro ao enviar. Tente novamente mais tarde.", "error");
      } else {
        alert("❌ Erro ao enviar. Tente novamente mais tarde.");
      }
    }
  });
}
