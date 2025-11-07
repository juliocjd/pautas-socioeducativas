document.addEventListener("DOMContentLoaded", async () => {
  let parlamentares = [];
  let congressistasExtras = {};

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
    const postElements = document.querySelectorAll(".instagram-post");
    for (const el of postElements) {
      const postUrl = el.dataset.postUrl;
      if (postUrl) {
        try {
          const response = await fetch(
            `https://api.instagram.com/oembed?url=${postUrl}`
          );
          const data = await response.json();
          if (data.html) {
            el.innerHTML = data.html;
          }
        } catch (error) {
          console.error("Erro ao carregar post do Instagram:", error);
          el.innerHTML = `<a href="${postUrl}" target="_blank">Ver post no Instagram</a>`;
        }
      }
    }
  }

  async function fetchAndRenderManifestacoes() {
    const container = document.getElementById("lista-manifestacoes");
    const loading = document.getElementById("manifestacoes-loading");
    const tryPaths = [
      "/manifestacoes.json",
      "/api/manifestacoes.json",
      "/manifestacoes",
      "/api/manifestacoes",
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
            <div class="instagram-post mt-2" data-post-url="${post_url}"></div>
            ${mensagem ? `<p class="mt-2"><em>"${mensagem}"</em></p>` : ""}
            <small class="text-muted">${data}</small>
          </div>
          <div class="text-end">
            <button class="btn btn-outline-primary btn-agradecer" type="button" data-parlamentar="${escapeHtml(
              parlamentar
            )}" data-mensagem="${escapeHtml(
        mensagem || "Obrigado pelo apoio!"
      )}">Agradecer</button>
          </div>
        </div>
      `;

      ul.appendChild(li);
    });

    if (container) {
      container.innerHTML = "";
      container.appendChild(ul);
    }

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

        // Tenta encontrar o postUrl associado (procura o elemento pai .manifestacao-item)
        let postUrl = null;
        const item = btn.closest(".manifestacao-item");
        if (item) {
          const postEl = item.querySelector(".instagram-post");
          if (postEl && postEl.dataset.postUrl)
            postUrl = postEl.dataset.postUrl;
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
    // Tenta Web Share API
    if (navigator.share) {
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
  await embedInstagramPosts();
  setupAgradecerButtons();
  setupPublicForm();

  // Since Instagram embeds can be slow, we might need to re-run the script that processes them
  // after the embed script has loaded and rendered the iframe.
  setTimeout(() => {
    if (window.instgrm) {
      window.instgrm.Embeds.process();
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
