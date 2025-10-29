#!/usr/bin/env python3
"""
Script para atualizar cache de parlamentares
Busca dados das APIs oficiais da Câmara e Senado (incluindo sexo)
Salva em /parlamentares_cache.json
Roda semanalmente via GitHub Actions
"""

import requests
import json
import xml.etree.ElementTree as ET
from datetime import datetime
import time

def buscar_deputados():
    """Busca todos os deputados em exercício da Câmara"""
    print("🔄 Buscando deputados...")
    
    url = "https://dadosabertos.camara.leg.br/api/v2/deputados"
    params = {
        "ordem": "ASC",
        "ordenarPor": "nome",
        "itens": 1000 # Ajuste se necessário
    }
    
    try:
        response = requests.get(url, params=params, timeout=60) # Adicionado timeout
        response.raise_for_status()
        data = response.json()
    except requests.exceptions.RequestException as e:
        print(f"    ❌ Erro ao buscar lista de deputados: {e}")
        return []

    deputados = []
    total = len(data.get('dados', []))
    print(f"  {total} deputados encontrados na lista. Buscando detalhes...")
    
    session = requests.Session() # Usar sessão para reutilizar conexão

    for i, dep in enumerate(data.get('dados', []), 1):
        print(f"  Processando Deputado {i}/{total}: {dep.get('nome', 'Nome não encontrado')}")
        
        # Valores padrão
        deputado = {
            "id": str(dep.get('id', '')),
            "nome": dep.get('nome', ''),
            "partido": dep.get('siglaPartido', ''),
            "uf": dep.get('siglaUf', ''),
            "email": dep.get('email', ''),
            "telefone_gabinete": '',
            "sexo": '', # <-- Campo novo
            "casa": "Câmara",
            "situacao": "Exercício" # Assume exercício como padrão
        }

        # Buscar detalhes (telefone, sexo, situação real)
        try:
            detail_url = dep.get('uri', '')
            if not detail_url:
                print(f"    ⚠️ URI não encontrada para {deputado['nome']}, pulando detalhes.")
                deputados.append(deputado)
                continue

            detail_response = session.get(detail_url, timeout=30) # Adicionado timeout
            detail_response.raise_for_status()
            detail_data = detail_response.json().get('dados', {})
            
            ultimo_status = detail_data.get('ultimoStatus', {})
            gabinete = ultimo_status.get('gabinete', {})
            
            # Atualiza campos com detalhes
            deputado["email"] = ultimo_status.get('email') or deputado['email'] # Usa o email do status se disponível
            deputado["telefone_gabinete"] = gabinete.get('telefone', '')
            deputado["sexo"] = detail_data.get('sexo', '').upper() # <-- Pega o sexo (M/F)
            deputado["situacao"] = ultimo_status.get('situacao', 'Exercício') # Pega a situação real
            
            deputados.append(deputado)
            
            # Aguardar um pouco para não sobrecarregar API
            time.sleep(0.15) # Aumentado ligeiramente o delay
            
        except requests.exceptions.RequestException as e:
            print(f"    ⚠️ Erro ao buscar detalhes para {deputado['nome']}: {e}")
            # Adiciona com dados básicos se detalhes falharem
            deputados.append(deputado)
        except json.JSONDecodeError as e:
            print(f"    ⚠️ Erro ao decodificar JSON dos detalhes para {deputado['nome']}: {e}")
            deputados.append(deputado)
        except Exception as e:
             print(f"    ⚠️ Erro inesperado ao processar detalhes de {deputado['nome']}: {e}")
             deputados.append(deputado)
    
    # Filtrar apenas os em Exercício no final
    deputados_em_exercicio = [d for d in deputados if d['situacao'] == 'Exercício']
    print(f"✅ {len(deputados_em_exercicio)} deputados em exercício carregados.")
    return deputados_em_exercicio

def buscar_senadores():
    """Busca todos os senadores em exercício do Senado"""
    print("🔄 Buscando senadores...")
    
    url_lista = "https://legis.senado.leg.br/dadosabertos/senador/lista/atual"
    
    try:
        response_lista = requests.get(url_lista, timeout=60) # Adicionado timeout
        response_lista.raise_for_status()
        response_lista.encoding = response_lista.apparent_encoding # Tenta detectar encoding
        
        root = ET.fromstring(response_lista.text) # Usa .text
        parlamentares_lista = root.findall('.//Parlamentar')
    except requests.exceptions.RequestException as e:
        print(f"    ❌ Erro ao buscar lista de senadores: {e}")
        return []
    except ET.ParseError as e:
        print(f"    ❌ Erro ao parsear XML da lista de senadores: {e}")
        return []
        
    senadores = []
    total = len(parlamentares_lista)
    print(f"  {total} senadores encontrados na lista. Buscando detalhes...")
    
    session = requests.Session() # Usar sessão

    for i, parl in enumerate(parlamentares_lista, 1):
        try:
            identificacao = parl.find('IdentificacaoParlamentar')
            if identificacao is None:
                print(f"    ⚠️ Senador {i}/{total} sem identificação, pulando.")
                continue

            codigo = identificacao.findtext('CodigoParlamentar', default='')
            nome = identificacao.findtext('NomeParlamentar', default='')
            
            print(f"  Processando Senador {i}/{total}: {nome}")
            
            # Valores básicos da lista
            senador_base = {
                "id": f"SEN-{codigo}",
                "nome": nome,
                "partido": identificacao.findtext('SiglaPartidoParlamentar', default=''),
                "uf": identificacao.findtext('UfParlamentar', default=''),
                "email": parl.findtext('.//Email', default=''),
                "telefone_gabinete": '', # Será buscado nos detalhes
                "sexo": '',             # <-- Campo novo, será buscado nos detalhes
                "casa": "Senado",
                "situacao": "Exercício" # Assume exercício, API de detalhes pode confirmar
            }

            # --- CORREÇÃO: Buscar detalhes para pegar sexo e telefone ---
            if codigo:
                try:
                    url_detalhe = f"https://legis.senado.leg.br/dadosabertos/senador/{codigo}"
                    headers = {'Accept': 'application/json'} # Pedir JSON
                    response_detalhe = session.get(url_detalhe, headers=headers, timeout=30) # Adicionado timeout
                    response_detalhe.raise_for_status()
                    detalhes = response_detalhe.json().get('detalheParlamentar', {}).get('parlamentar', {})

                    dados_basicos = detalhes.get('dadosBasicosParlamentar', {})
                    contato = detalhes.get('contatoParlamentar', {})
                    
                    # Atualiza/Confirma dados
                    senador_base["telefone_gabinete"] = contato.get('numTelefoneGabinete', '')
                    sexo_str = dados_basicos.get('sexoParlamentar', '')
                    senador_base["sexo"] = 'M' if sexo_str == 'Masculino' else ('F' if sexo_str == 'Feminino' else '') # <-- Pega o sexo (M/F)
                    
                    # Poderia pegar a situação real aqui se a API fornecer
                    
                    senadores.append(senador_base)
                    time.sleep(0.15) # Delay

                except requests.exceptions.RequestException as e:
                    print(f"    ⚠️ Erro ao buscar detalhes JSON para {nome}: {e}")
                    senadores.append(senador_base) # Adiciona com dados básicos
                except json.JSONDecodeError as e:
                     print(f"    ⚠️ Erro ao decodificar JSON dos detalhes para {nome}: {e}")
                     senadores.append(senador_base)
                except Exception as e:
                     print(f"    ⚠️ Erro inesperado ao processar detalhes de {nome}: {e}")
                     senadores.append(senador_base)
            else:
                 print(f"    ⚠️ Código não encontrado para {nome}, pulando detalhes.")
                 senadores.append(senador_base) # Adiciona com dados básicos
                 
        except Exception as e:
            print(f"    ⚠️ Erro geral ao processar senador {i}/{total}: {e}")
            continue # Pula para o próximo senador
    
    # Idealmente, filtrar por situação de exercício se a API de detalhes fornecer
    print(f"✅ {len(senadores)} senadores carregados.")
    return senadores

def salvar_cache(parlamentares):
    """Salva cache em arquivo JSON"""
    print("💾 Salvando cache...")
    
    # Ordenar alfabeticamente pelo nome
    parlamentares_ordenados = sorted(parlamentares, key=lambda p: p['nome'])
    
    cache = {
        "parlamentares": parlamentares_ordenados, # Salva a lista ordenada
        "ultima_atualizacao": datetime.now().isoformat(),
        "total_deputados": len([p for p in parlamentares if p['casa'] == 'Câmara']),
        "total_senadores": len([p for p in parlamentares if p['casa'] == 'Senado'])
    }
    
    try:
        with open('parlamentares_cache.json', 'w', encoding='utf-8') as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
        print(f"✅ Cache salvo: {cache['total_deputados']} deputados + {cache['total_senadores']} senadores")
    except IOError as e:
        print(f"    ❌ Erro ao escrever arquivo de cache: {e}")
        raise # Relança o erro para falhar a Action se não conseguir salvar

def main():
    try:
        print("=" * 60)
        print("🏛️  ATUALIZAÇÃO DE CACHE DE PARLAMENTAREs (COM SEXO)")
        print("=" * 60)
        print(f"Início: {datetime.now()}")
        print()
        
        # Buscar dados
        deputados = buscar_deputados()
        print()
        senadores = buscar_senadores()
        print()
        
        # Combinar
        parlamentares = deputados + senadores
        
        # Salvar
        if parlamentares: # Só salva se conseguiu buscar algo
             salvar_cache(parlamentares)
        else:
             print("❌ Nenhum parlamentar foi carregado. Cache não será atualizado.")
             raise Exception("Falha ao carregar dados de deputados e/ou senadores.")

        
        print()
        print("=" * 60)
        print(f"Fim: {datetime.now()}")
        print("✅ ATUALIZAÇÃO CONCLUÍDA COM SUCESSO!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ ERRO DURANTE A ATUALIZAÇÃO: {e}")
        # Faz a Action falhar se ocorrer um erro
        import sys
        sys.exit(1)

if __name__ == '__main__':
    main()