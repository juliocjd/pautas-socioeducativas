#!/bin/bash

# Instalar Ruby e dependências
bundle install

# Build do Jekyll
bundle exec jekyll build

# Copiar arquivos adicionais para _site
cp -r tools _site/tools
cp -r api _site/api
