# Pautas Socioeducativas

Plataforma web para acompanhar proposições legislativas de interesse dos agentes de segurança socioeducativos e organizar a mobilização junto a deputados e senadores.

**Site:** https://pautas-socioeducativas.vercel.app

## O que o site faz

- **Acompanhamento de pautas:** lista as propostas em andamento, com destaque para a principal. Cada pauta mostra a casa legislativa, a situação e os parlamentares envolvidos, com partido, estado, função e posição (apoia, contrário ou não se manifestou).
- **Filtros:** busca de parlamentares por nome, estado e posição.
- **Campanhas de mobilização:** abre o e-mail ou o WhatsApp com a mensagem pronta para o parlamentar e copia o texto para envio pelo Instagram.
- **Contribuições da comunidade:** qualquer pessoa pode enviar contatos (WhatsApp, Instagram, assessores), correções e evidências do posicionamento de um parlamentar. Tudo passa por moderação antes de ser publicado.
- **Agradecimentos:** página com manifestações públicas de apoio à causa socioeducativa.
- **Painel administrativo:** área protegida por senha para criar e editar pautas, moderar contribuições e acompanhar estatísticas.

## Como funciona

- **Site estático:** gerado com [Eleventy (11ty)](https://www.11ty.dev/) e templates Liquid. Cada pauta é um arquivo Markdown na pasta `pautas/`.
- **API serverless:** funções Node.js na Vercel (pasta `api/`) que leem e gravam no próprio repositório pela API do GitHub, com Octokit. O repositório funciona como banco de dados, com os dados em YAML na pasta `_data/`.
- **Moderação por pull request:** cada contribuição enviada pelo site vira um pull request. A aprovação ou a rejeição é feita pelo painel administrativo.
- **Dados oficiais:** a lista de deputados e senadores vem das APIs de dados abertos da Câmara dos Deputados e do Senado Federal. Um script Python roda toda segunda-feira pelo GitHub Actions e atualiza o arquivo `parlamentares_cache.json`.

## Tecnologias

Eleventy 3, Liquid, JavaScript, Bootstrap 4, Node.js (funções serverless na Vercel), Octokit (API do GitHub), Python e GitHub Actions.

## Estrutura do projeto

| Caminho | Conteúdo |
| --- | --- |
| `pautas/` | Pautas em Markdown, uma por arquivo |
| `_layouts/` e `_includes/` | Templates Liquid das páginas |
| `_data/` | Dados em YAML: contatos, evidências, manifestações e contribuições pendentes |
| `api/` | Funções serverless: pautas, contribuições, evidências, manifestações e login do painel |
| `assets/` | CSS e JavaScript do site |
| `tools/` | Painel administrativo e página de diagnóstico das APIs |
| `scripts/` | Script Python que atualiza o cache de parlamentares |
| `.github/workflows/` | Agendamento semanal da atualização |

## Como rodar localmente

```bash
npm install
npm run dev     # servidor local com recarga automática
npm run build   # gera o site na pasta _site/
```

As funções da pasta `api/` rodam na Vercel e usam estas variáveis de ambiente:

| Variável | Uso |
| --- | --- |
| `GITHUB_TOKEN` | Token com permissão de escrita no repositório |
| `GITHUB_OWNER`, `GITHUB_REPO` e `GITHUB_BRANCH` | Repositório e branch onde os dados são gravados |
| `ADMIN_PASSWORD_HASH` | Hash da senha do painel administrativo |

## Autor

Julio Justini · [github.com/juliocjd](https://github.com/juliocjd)
