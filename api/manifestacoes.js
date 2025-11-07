const fs = require("fs").promises;
const path = require("path");
const yaml = require("js-yaml");
const { Octokit } = require("@octokit/rest");

module.exports = async (req, res) => {
  // Permit only GET
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  // CORS (allow same-origin / public access)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  // Try to read from GitHub via Octokit when token is available so changes committed
  // via API are visible immediately without requiring a redeploy.
  const token = process.env.GITHUB_TOKEN;
  const owner =
    process.env.GITHUB_OWNER || process.env.VERCEL_GIT_REPO_OWNER || "juliocjd";
  const repo =
    process.env.GITHUB_REPO ||
    process.env.VERCEL_GIT_REPO_SLUG ||
    "pautas-socioeducativas";
  const branch =
    process.env.GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || "main";

  try {
    if (token) {
      try {
        const octokit = new Octokit({ auth: token });
        const pathInRepo = "_data/manifestacoes.yml";
        const { data: fileData } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: pathInRepo,
          ref: branch,
        });
        const content = Buffer.from(fileData.content, "base64").toString(
          "utf8"
        );
        const parsed = yaml.load(content);
        let manifestacoes = [];
        if (Array.isArray(parsed)) manifestacoes = parsed;
        else if (parsed && typeof parsed === "object") manifestacoes = parsed;
        return res.status(200).json(manifestacoes);
      } catch (err) {
        // If GitHub read fails for some reason, fallback to local filesystem below
        console.warn(
          "Warning: leitura via GitHub falhou, tentando filesystem fallback:",
          err && err.message
        );
      }
    }

    // Fallback: read from local filesystem as before
    const manifestPath = path.join(process.cwd(), "_data", "manifestacoes.yml");
    let manifestacoes = [];

    try {
      const content = await fs.readFile(manifestPath, "utf8");
      const parsed = yaml.load(content);
      if (Array.isArray(parsed)) manifestacoes = parsed;
      else if (parsed && typeof parsed === "object") manifestacoes = parsed;
    } catch (err) {
      if (err.code === "ENOENT") {
        manifestacoes = [];
      } else {
        throw err;
      }
    }

    return res.status(200).json(manifestacoes);
  } catch (error) {
    console.error("Erro em /api/manifestacoes:", error);
    return res.status(500).json({ error: "Erro interno ao ler manifestações" });
  }
};
