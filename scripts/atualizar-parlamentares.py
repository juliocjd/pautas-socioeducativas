#!/usr/bin/env python3
"""
Script para atualizar cache de parlamentares
Busca dados das APIs oficiais da Câmara e Senado
Salva em _data/parlamentares_cache.json
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
        "itens": 1000
    }
    
    response = requests.get(url, params=params)
    response.raise_for_status()
    data = response.json()
    
    deputados = []
    total = len(data['dados'])
    
    for i, dep in enumerate(data['dados'], 1):
        print(f"  Processando {i}/{total}: {dep['nome']}")
        
        # Buscar detalhes (telefone do gabinete)
        try:
            detail_url = f"https://dadosabertos.camara.leg.br/api/v2/deputados/{dep['id']}"
            detail_response = requests.get(detail_url)
            detail_data = detail_response.json()
            
            ultimo_status = detail_data['dados'].get('ultimoStatus', {})
            gabinete = ultimo_status.get('gabinete', {})
            
            deputado = {
                "id": str(dep['id']),
                "nome": dep['nome'],
                "partido": dep['siglaPartido'],
                "uf": dep['siglaUf'],
                "email": dep.get('email') or ultimo_status.get('email') or '',
                "telefone_gabinete": gabinete.get('telefone') or '',
                "casa": "Câmara",
                "situacao": ultimo_status.get('situacao') or 'Exercício'
            }
            
            deputados.append(deputado)
            
            # Aguardar um pouco para não sobrecarregar API
            time.sleep(0.1)
            
        except Exception as e:
            print(f"    ⚠️ Erro ao buscar detalhes: {e}")
            # Adicionar sem telefone
            deputados.append({
                "id": str(dep['id']),
                "nome": dep['nome'],
                "partido": dep['siglaPartido'],
                "uf": dep['siglaUf'],
                "email": dep.get('email') or '',
                "telefone_gabinete": '',
                "casa": "Câmara",
                "situacao": "Exercício"
            })
    
    print(f"✅ {len(deputados)} deputados carregados")
    return deputados

def buscar_senadores():
    """Busca todos os senadores em exercício do Senado"""
    print("🔄 Buscando senadores...")
    
    url = "https://legis.senado.leg.br/dadosabertos/senador/lista/atual"
    
    response = requests.get(url)
    response.raise_for_status()
    
    root = ET.fromstring(response.content)
    senadores = []
    
    for parl in root.findall('.//Parlamentar'):
        try:
            identificacao = parl.find('IdentificacaoParlamentar')
            
            nome = identificacao.find('NomeParlamentar').text if identificacao.find('NomeParlamentar') is not None else ''
            codigo = identificacao.find('CodigoParlamentar').text if identificacao.find('CodigoParlamentar') is not None else ''
            partido = identificacao.find('SiglaPartidoParlamentar').text if identificacao.find('SiglaPartidoParlamentar') is not None else ''
            uf = identificacao.find('UfParlamentar').text if identificacao.find('UfParlamentar') is not None else ''
            
            # Email
            email = ''
            emails = parl.findall('.//Email')
            if emails:
                email = emails[0].text or ''
            
            # Telefone
            telefone = ''
            telefones = parl.findall('.//Telefone/NumeroTelefone')
            if telefones:
                telefone = telefones[0].text or ''
            
            senador = {
                "id": f"SEN-{codigo}",
                "nome": nome,
                "partido": partido,
                "uf": uf,
                "email": email,
                "telefone_gabinete": telefone,
                "casa": "Senado",
                "situacao": "Exercício"
            }
            
            senadores.append(senador)
            
        except Exception as e:
            print(f"    ⚠️ Erro ao processar senador: {e}")
            continue
    
    print(f"✅ {len(senadores)} senadores carregados")
    return senadores

def salvar_cache(parlamentares):
    """Salva cache em arquivo JSON"""
    print("💾 Salvando cache...")
    
    cache = {
        "parlamentares": parlamentares,
        "ultima_atualizacao": datetime.now().isoformat(),
        "total_deputados": len([p for p in parlamentares if p['casa'] == 'Câmara']),
        "total_senadores": len([p for p in parlamentares if p['casa'] == 'Senado'])
    }
    
    with open('_data/parlamentares_cache.json', 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
    
    print(f"✅ Cache salvo: {cache['total_deputados']} deputados + {cache['total_senadores']} senadores")

def main():
    try:
        print("=" * 60)
        print("🏛️  ATUALIZAÇÃO DE CACHE DE PARLAMENTARES")
        print("=" * 60)
        print()
        
        # Buscar dados
        deputados = buscar_deputados()
        print()
        senadores = buscar_senadores()
        print()
        
        # Combinar
        parlamentares = deputados + senadores
        
        # Salvar
        salvar_cache(parlamentares)
        
        print()
        print("=" * 60)
        print("✅ ATUALIZAÇÃO CONCLUÍDA COM SUCESSO!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ ERRO: {e}")
        raise

if __name__ == '__main__':
    main()
