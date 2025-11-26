module.exports = {
  permalink: (data) => `/pautas/${data.page.fileSlug}/`,
  eleventyComputed: {
    slug: (data) => data.page.fileSlug,
  },
};
