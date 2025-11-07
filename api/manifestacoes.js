const fs = require("fs").promises;
const path = require("path");
const yaml = require("js-yaml");

module.exports = async (req, res) => {
  // Permit only GET
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  // CORS (allow same-origin / public access)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  try {
    const manifestPath = path.join(process.cwd(), "_data", "manifestacoes.yml");
    let manifestacoes = [];

    try {
      const content = await fs.readFile(manifestPath, "utf8");
      const parsed = yaml.load(content);
      // parsed can be array or object
      if (Array.isArray(parsed)) manifestacoes = parsed;
      else if (parsed && typeof parsed === "object") manifestacoes = parsed;
    } catch (err) {
      if (err.code === "ENOENT") {
        // File not found: return empty array
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
