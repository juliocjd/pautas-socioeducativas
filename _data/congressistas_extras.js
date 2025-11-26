const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

module.exports = () => {
  const filePath = path.join(__dirname, "congressistas_extras.yml");

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = yaml.load(raw);

    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (error) {
    console.warn(
      "[data] Falha ao carregar congressistas_extras.yml:",
      error.message
    );
  }

  return { congressistas: {} };
};
