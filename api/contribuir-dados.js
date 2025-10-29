// API para receber contribuições de DADOS de parlamentares
// WhatsApp, Instagram, Assessores, Evidências
// --- ATUALIZADO para escrever no .YML e processar CORREÇÕES ---
import { Octokit } from "@octokit/rest";
import yaml from "js-yaml"; // <-- ADICIONADO

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "POST") {
    try {
      const {
        parlamentar_id,
        parlamentar_nome,
        pauta_slug,
        dados_contato,
        evidencia,
        correcoes, // <-- ADICIONADO
        usuario_nome,
        usuario_email,
      } = req.body;

      // Validação
      if (!parlamentar_id || !parlamentar_nome) {
        return res.status(400).json({
          error: "ID e nome do parlamentar são obrigatórios",
          campos_recebidos: Object.keys(req.body),
        });
      }

      // Validar que pelo menos um dado foi enviado
      const temDadosNovos =
        dados_contato && Object.keys(dados_contato).length > 0;
      const temEvidencia = evidencia && evidencia.url;
      const temCorrecoes = correcoes && Object.keys(correcoes).length > 0; // <-- ADICIONADO

      if (!temDadosNovos && !temEvidencia && !temCorrecoes) {
        // <-- ATUALIZADO
        return res.status(400).json({
          error: "Envie pelo menos um dado novo, uma evidência ou uma correção",
        });
      }

      const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN,
      });

      const owner = process.env.GITHUB_OWNER || "juliocjd";
      const repo = process.env.GITHUB_REPO || "pautas-socioeducativas";
      const branch = "main";

      // --- CORREÇÃO DO BUG 2: Mudar para YML ---
      const FILE_PATH = "_data/congressistas_extras.yml";
      // ------------------------------------------

      console.log("📝 Nova contribuição de dados (para YML):", {
        parlamentar_id,
        parlamentar_nome,
        usuario: usuario_nome,
      });

      // Criar branch para o PR
      const branchName = `contrib-dados-${parlamentar_id}-${Date.now()}`;

      // Obter referência da branch main
      const { data: refData } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });

      // Criar nova branch
      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: refData.object.sha,
      });

      console.log(`✅ Branch criada: ${branchName}`);

      // Buscar arquivo atual de congressistas (YML)
      let congressistas = { congressistas: {} };
      let fileSha = null;

      try {
        const { data: fileData } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: FILE_PATH, // <-- CORRIGIDO
          ref: branch,
        });

        fileSha = fileData.sha;
        const content = Buffer.from(fileData.content, "base64").toString(
          "utf-8"
        );
        congressistas = yaml.load(content) || { congressistas: {} }; // <-- CORRIGIDO: yaml.load
        console.log(`✅ Arquivo ${FILE_PATH} lido com sucesso.`);
      } catch (error) {
        if (error.status === 404) {
          console.log(`ℹ️ Arquivo ${FILE_PATH} não existe, será criado`);
          congressistas = { congressistas: {} };
        } else {
          throw error;
        }
      }

      // Atualizar dados (APENAS ADICIONA NOVOS DADOS - Correções são manuais na aprovação)
      // Garantir estrutura
      if (!congressistas.congressistas) {
        congressistas.congressistas = {};
      }
      if (!congressistas.congressistas[parlamentar_id]) {
        congressistas.congressistas[parlamentar_id] = {};
      }

      const parlamentar = congressistas.congressistas[parlamentar_id];

      // Adicionar dados de contato (se enviados)
      if (temDadosNovos) {
        if (dados_contato.whatsapp) {
          if (!parlamentar.whatsapp) parlamentar.whatsapp = [];
          if (!Array.isArray(parlamentar.whatsapp))
            parlamentar.whatsapp = [parlamentar.whatsapp];
          if (!parlamentar.whatsapp.includes(dados_contato.whatsapp)) {
            parlamentar.whatsapp.push(dados_contato.whatsapp);
          }
        }
        if (dados_contato.instagram) {
          parlamentar.instagram = dados_contato.instagram; // Substitui o que estiver no *arquivo* (se houver)
        }
        if (dados_contato.assessores && dados_contato.assessores.length > 0) {
          if (!parlamentar.assessores) parlamentar.assessores = [];
          dados_contato.assessores.forEach((novoAss) => {
            const existe = parlamentar.assessores.some(
              (a) => a.whatsapp === novoAss.whatsapp
            );
            if (!existe) parlamentar.assessores.push(novoAss);
          });
        }
      }

      // Adicionar evidência (se enviada)
      if (temEvidencia) {
        if (!parlamentar.evidencias) parlamentar.evidencias = [];

        const novaEvidencia = {
          ...evidencia,
          pauta_slug: pauta_slug || "geral",
          contribuido_por: usuario_nome || "Anônimo",
          data: new Date().toISOString(),
        };
        const existe = parlamentar.evidencias.some(
          (e) => e.url === evidencia.url
        );
        if (!existe) parlamentar.evidencias.push(novaEvidencia);
      }

      // Adicionar data de atualização
      parlamentar.ultima_atualizacao = new Date().toISOString().split("T")[0];

      // Salvar arquivo atualizado (YML) na nova branch
      const newContent = yaml.dump(congressistas, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
      }); // <-- CORRIGIDO: yaml.dump

      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: FILE_PATH, // <-- CORRIGIDO
        message: `Contribuição de dados: ${parlamentar_nome}`,
        content: Buffer.from(newContent).toString("base64"),
        branch: branchName,
        sha: fileSha,
      });

      console.log(`✅ Arquivo ${FILE_PATH} atualizado na branch ${branchName}`);

      // --- ATUALIZAÇÃO DO CORPO DO PR ---
      let prBody = `## 📊 Contribuição de Dados
      
**Parlamentar:** ${parlamentar_nome} (ID: ${parlamentar_id})
**Pauta:** \`${pauta_slug || "N/A"}\`
**Contribuído por:** ${usuario_nome || "Anônimo"} (${usuario_email || "N/A"})
`;

      // Adiciona seção de NOVOS dados
      if (temDadosNovos || temEvidencia) {
        prBody += `
### Novos Dados Enviados (para adicionar/mesclar):
${
  dados_contato?.whatsapp
    ? `- 📱 Novo WhatsApp: \`${dados_contato.whatsapp}\`\n`
    : ""
}
${
  dados_contato?.instagram && (!correcoes || !correcoes.instagram)
    ? `- 📷 Novo Instagram: \`${dados_contato.instagram}\`\n`
    : ""
}
${
  dados_contato?.assessores && dados_contato.assessores.length > 0
    ? `- 👥 Novos Assessores: ${dados_contato.assessores.length}\n`
    : ""
}
${evidencia ? `- 📄 Evidência: [${evidencia.tipo}](${evidencia.url})\n` : ""}
`;
      }

      // Adiciona seção de CORREÇÕES
      if (temCorrecoes) {
        prBody += `
---
### ⚠️ Correções Sugeridas (para substituir):
${
  correcoes.instagram
    ? `- 📷 **Correção de Instagram:** \`${correcoes.instagram}\`\n`
    : ""
}
${
  correcoes.whatsapp_obs
    ? `- 📱 **Obs. WhatsApp:** \`${correcoes.whatsapp_obs}\`\n`
    : ""
}
${
  correcoes.assessores_obs
    ? `- 👥 **Obs. Assessores:** \`${correcoes.assessores_obs}\`\n`
    : ""
}
`;
      }

      prBody += `
---
_Esta contribuição foi enviada pela comunidade e precisa ser revisada._
_O ficheiro ${FILE_PATH} nesta branch já foi atualizado com os **novos dados** (não com as correções)._`;
      // --- FIM DA ATUALIZAÇÃO DO CORPO DO PR ---

      const { data: pr } = await octokit.rest.pulls.create({
        owner,
        repo,
        title: `[CONTRIBUIÇÃO] Dados de ${parlamentar_nome}`,
        head: branchName,
        base: branch,
        body: prBody,
      });

      // Adicionar labels
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: pr.number,
        labels: ["contribuição", "dados-parlamentar", "aguardando-revisão"],
      });

      console.log(`✅ Pull Request criado: #${pr.number}`);

      return res.status(200).json({
        success: true,
        message: "Contribuição enviada com sucesso! Será revisada em breve.",
        pr_number: pr.number,
        pr_url: pr.html_url,
      });
    } catch (error) {
      console.error("❌ Erro ao processar contribuição:", error);

      return res.status(500).json({
        success: false,
        error: "Erro ao processar contribuição",
        details: error.message,
      });
    }
  }

  return res.status(405).json({ error: "Método não permitido" });
}
