
import requests
import json
import os

# URL da API da Câmara para listar deputados em exercício
URL_CAMARA = "https://dadosabertos.camara.leg.br/api/v2/deputados?itens=1000"
# URL da API do Senado para listar senadores em exercício
URL_SENADO = "https://legis.senado.leg.br/dadosabertos/senador/lista/atual"

def buscar_deputados():
    print("Buscando dados dos Deputados...")
    response = requests.get(URL_CAMARA)
    response.raise_for_status()
    dados = response.json()
    
    deputados = []
    for dep in dados['dados']:
        deputados.append({
            "id": str(dep['id']),
            "nome": dep['nome'],
            "partido": dep['siglaPartido'],
            "uf": dep['siglaUf']
        })
    print(f"{len(deputados)} deputados encontrados.")
    return deputados

def buscar_senadores():
    print("Buscando dados dos Senadores...")
    response = requests.get(URL_SENADO)
    response.raise_for_status()
    # A API do Senado retorna XML, então vamos precisar de um parser. Para simplificar, vamos pular por enquanto.
    # Para um projeto real, você usaria uma biblioteca como 'xmltodict'.
    print("Busca de senadores não implementada neste script de exemplo.")
    return []

def main():
    # Caminho para a pasta _data
    data_dir = os.path.join(os.path.dirname(__file__), '..', '_data')
    output_file = os.path.join(data_dir, 'parlamentares_base.json')

    todos_parlamentares = []
    todos_parlamentares.extend(buscar_deputados())
    # todos_parlamentares.extend(buscar_senadores()) # Descomentar quando implementar a busca de senadores

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(todos_parlamentares, f, ensure_ascii=False, indent=2)
    
    print(f"\nArquivo '{output_file}' atualizado com sucesso!")
    print("Agora, faça o commit e push deste arquivo para o seu repositório GitHub.")

if __name__ == '__main__':
    main()

