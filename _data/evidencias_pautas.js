const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

module.exports = () => {
  const filePath = path.join(__dirname, "evidencias_pautas.yml");

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = yaml.load(raw);

    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (error) {
    console.warn(
      "[data] Falha ao carregar evidencias_pautas.yml:",
      error.message
    );
  }

  return { pautas: {} };
};
