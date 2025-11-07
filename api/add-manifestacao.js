const { Octokit } = require("@octokit/rest");
const yaml = require("js-yaml");

module.exports = async (req, res) => {
  // CORS (admin e front-end podem chamar)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  // DEBUG mode: se definir DEBUG=true nas env vars, retornamos stack para facilitar o debug em deploy
  const DEBUG = String(process.env.DEBUG || "").toLowerCase() === "true";

  // Helper para responder erros com estágio
  function respondError(stage, err) {
    console.error(
      `[add-manifestacao] error at stage=${stage}:`,
      err && (err.stack || err.message || err)
    );
    const payload = {
      success: false,
      stage,
      message: err && (err.message || String(err)),
    };
    if (DEBUG && err && err.stack) payload.stack = err.stack;
    // Se existir detalhes adicionais no erro, tente anexar
    if (err && err.details) payload.details = err.details;
    return res.status(500).json(payload);
  }

  try {
    console.log("[add-manifestacao] incoming request, method=POST");
    console.log(
      "[add-manifestacao] body preview:",
      JSON.stringify(req.body).slice(0, 1000)
    );

    const novaManifestacao = req.body || {};
    // Enriquecer com data
    novaManifestacao.data = new Date().toLocaleDateString("pt-BR");

    // Preparar Octokit
    const token = process.env.GITHUB_TOKEN;
    const owner =
      process.env.GITHUB_OWNER ||
      process.env.VERCEL_GIT_REPO_OWNER ||
      "juliocjd";
    const repo =
      process.env.GITHUB_REPO ||
      process.env.VERCEL_GIT_REPO_SLUG ||
      "pautas-socioeducativas";
    const branch =
      process.env.GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || "main";

    if (!token) {
      return respondError(
        "validate_env",
        new Error("GITHUB_TOKEN not configured")
      );
    }

    const octokit = new Octokit({ auth: token });

    const path = "_data/manifestacoes.yml";
    let fileSha = null;
    let manifestacoes = [];

    // Buscar arquivo atual
    try {
      console.log("[add-manifestacao] getting content", {
        owner,
        repo,
        path,
        ref: branch,
      });
      const { data: fileData } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref: branch,
      });
      fileSha = fileData.sha;
      const content = Buffer.from(fileData.content, "base64").toString("utf-8");
      manifestacoes = yaml.load(content) || [];
      console.log(
        `[add-manifestacao] loaded manifestacoes (${manifestacoes.length})`
      );
    } catch (err) {
      // file not found -> start fresh
      if (err && err.status === 404) {
        console.log(
          "[add-manifestacao] manifestacoes.yml not found, will create new"
        );
        manifestacoes = [];
      } else {
        return respondError("get_content", err);
      }
    }

    // Adiciona no início
    manifestacoes.unshift(novaManifestacao);

    const newContent = yaml.dump(manifestacoes, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    });
    const commitMessage = `Adicionar manifestação para ${
      novaManifestacao.parlamentar || "parlamentar"
    }`;

    const params = {
      owner,
      repo,
      path,
      message: commitMessage,
      content: Buffer.from(newContent).toString("base64"),
      branch,
    };
    if (fileSha) params.sha = fileSha;

    try {
      console.log(
        "[add-manifestacao] creating/updating file, commitMessage=",
        commitMessage
      );
      await octokit.rest.repos.createOrUpdateFileContents(params);
      console.log("[add-manifestacao] commit created/updated successfully");
    } catch (err) {
      return respondError("create_update_file", err);
    }

    return res
      .status(200)
      .json({
        success: true,
        message: "Manifestação adicionada com sucesso (commit criado).",
      });
  } catch (error) {
    return respondError("unknown", error);
  }
};
