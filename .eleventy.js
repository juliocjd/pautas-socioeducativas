const path = require("path");

const ensureLeadingSlash = (input = "") => {
  const value = input || "/";
  return value.startsWith("/") ? value : `/${value}`;
};

module.exports = function (eleventyConfig) {
  const siteData = require("./_data/site.js")();

  eleventyConfig.ignores.add("api/**");

  eleventyConfig.addCollection("pautas", (collectionApi) => {
    return collectionApi.getFilteredByGlob(["pautas/*.md", "pautas/**/*.md"]);
  });

  eleventyConfig.addFilter("relative_url", (url = "") => ensureLeadingSlash(url));

  eleventyConfig.addFilter("absolute_url", (url = "") => {
    const rel = ensureLeadingSlash(url);
    return `${siteData.url.replace(/\/$/, "")}${rel}`;
  });

  eleventyConfig.addFilter("normalize_whitespace", (input) => {
    if (typeof input !== "string") {
      return input || "";
    }
    return input.replace(/\s+/g, " ").trim();
  });

  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("scripts");
  eleventyConfig.addPassthroughCopy("tools");
  eleventyConfig.addPassthroughCopy("parlamentares_cache.json");
  eleventyConfig.addPassthroughCopy("_headers");
  eleventyConfig.addPassthroughCopy("vercel.json");

  eleventyConfig.setTemplateFormats(["html", "md", "liquid", "njk", "json"]);

  return {
    htmlTemplateEngine: "liquid",
    markdownTemplateEngine: "liquid",
    dir: {
      input: ".",
      includes: "_includes",
      data: "_data",
      layouts: "_layouts",
      output: "_site",
    },
  };
};
