import fs from 'fs';
import vision from '@google-cloud/vision';
import { logDev } from './util';

interface ProdutoExtraido {
    codigo: string;
    nome: string;
    quantidade_pecas: number;
    peso_total_kg: number;
    peso_medio_kg: number;
    pesos_individuais: number[];
}

function extrairProdutos(lines: string[]): ProdutoExtraido[] {
    console.log(lines);
    const produtos: ProdutoExtraido[] = [];

    // Primeira passada: identificar produtos e suas posições
    const indicesProdutos: { index: number; codigo: string; nome: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
        const linha = lines[i].trim();
        // Tentar formato: "001006 - QUARTO TRASEIRO - FEMEA" ou "001006- QUARTO TRASEIRO - FEMEA"
        let matchProduto = linha.match(/^(\d+)\s*-\s*(.+)$/);

        // Se não encontrou, tentar formato sem hífen mas que tenha palavras em maiúsculas após o código
        // Exemplo: "001006 QUARTO TRASEIRO - FEMEA"
        if (!matchProduto) {
            matchProduto = linha.match(/^(\d{6})\s+([A-Z].+(?:FEMEA|MACHO|SEM|COM).*)$/);
        }

        if (matchProduto) {
            indicesProdutos.push({
                index: i,
                codigo: matchProduto[1],
                nome: matchProduto[2].trim()
            });
        }
    }

    // Segunda passada: para cada produto, extrair os dados
    for (let p = 0; p < indicesProdutos.length; p++) {
        const produtoInfo = indicesProdutos[p];
        const inicioIndex = produtoInfo.index;
        const fimIndex = p < indicesProdutos.length - 1 ? indicesProdutos[p + 1].index : lines.length;

        const produto: ProdutoExtraido = {
            codigo: produtoInfo.codigo,
            nome: produtoInfo.nome,
            quantidade_pecas: 0,
            peso_total_kg: 0,
            peso_medio_kg: 0,
            pesos_individuais: []
        };

        // Extrair dados entre o início deste produto e o início do próximo
        let indiceTotalProduto = -1;

        for (let i = inicioIndex + 1; i < fimIndex; i++) {
            const linha = lines[i].trim();

            // Detectar peso(s) individual(is) - pode haver múltiplos pesos na mesma linha
            // Exemplo: "54,20 53,90" ou "37,10 33,40"
            const regexPesos = /\d+[,.]\d+/g;
            const matchesPesos = linha.match(regexPesos);
            
            if (matchesPesos && matchesPesos.length > 0) {
                // Verificar se a linha contém apenas pesos (sem texto adicional como "TOTAL" ou "PESO MÉDIO")
                const linhaApenasNumeros = linha.replace(/[\d.,\s]+/g, '').trim();
                
                if (linhaApenasNumeros === '') {
                    // A linha contém apenas pesos, adicionar todos
                    for (const pesoStr of matchesPesos) {
                        const peso = parseFloat(pesoStr.replace(',', '.'));
                        produto.pesos_individuais.push(peso);
                    }
                    continue;
                }
            }

            // Detectar quantidade de peças e marcar onde está o TOTAL
            const matchTotal = linha.match(/TOTAL DO PRODUTO:\s*(\d+)\s*PEÇAS:/i);
            if (matchTotal) {
                produto.quantidade_pecas = parseInt(matchTotal[1]);
                indiceTotalProduto = i;
                continue;
            }
        }

        // Buscar peso total e peso médio APÓS o "TOTAL DO PRODUTO", mesmo que seja no território do próximo produto
        if (indiceTotalProduto !== -1) {
            // Buscar nas próximas 5 linhas após o TOTAL
            for (let i = indiceTotalProduto + 1; i < Math.min(indiceTotalProduto + 6, lines.length); i++) {
                const linha = lines[i].trim();

                // Detectar peso total
                const matchPesoTotal = linha.match(/^([\d.,]+)\s*KG$/i);
                if (matchPesoTotal && produto.peso_total_kg === 0) {
                    const pesoStr = matchPesoTotal[1].replace(/\./g, '').replace(',', '.');
                    produto.peso_total_kg = parseFloat(pesoStr);
                    continue;
                }

                // Detectar peso médio
                const matchPesoMedio = linha.match(/PESO MÉDIO:\s*([\d,.]+)/i);
                if (matchPesoMedio && produto.peso_medio_kg === 0) {
                    produto.peso_medio_kg = parseFloat(matchPesoMedio[1].replace(',', '.'));
                    continue;
                }
            }
        }

        produtos.push(produto);
    }

    return produtos;
}

// Crie 1 worker e reutilize (bem mais rápido do que criar por request)
export default async (imageBuffer: Buffer, modelo = 1) => {
    try {
        let keyFile = __dirname + '/keys/lsdevelopers.json';
        const client = new vision.ImageAnnotatorClient({
            keyFilename: keyFile
        });
        if (modelo == 1) {
            const [result] = await client.textDetection(imageBuffer);
            let text = result.fullTextAnnotation?.text;
            const lines = text?.split("\n") || [];
            // Extrair produtos estruturados
            const produtos = extrairProdutos(lines);
            logDev('\n========== PRODUTOS EXTRAÍDOS ==========\n');
            for (const produto of produtos) {
                logDev(`📦 PRODUTO: ${produto.nome}`);
                logDev(`   Código: ${produto.codigo}`);
                logDev(`   Quantidade de Peças: ${produto.quantidade_pecas}`);
                logDev(`   Peso Total: ${produto.peso_total_kg.toFixed(2)} kg`);
                logDev(`   Peso Médio: ${produto.peso_medio_kg.toFixed(2)} kg`);
                logDev(`   Pesos Individuais (${produto.pesos_individuais.length}):`, produto.pesos_individuais.map(p => p.toFixed(2)).join(', '));
                if (produto.pesos_individuais.length != produto.quantidade_pecas) {
                    logDev('ERRO: A quantidade de pesos individuais não corresponde à quantidade de peças!');
                    throw new Error(`Atenção: A quantidade de pesos individuais (${produto.pesos_individuais.length}) não corresponde à quantidade de peças (${produto.quantidade_pecas}) para o produto ${produto.nome} (${produto.codigo}).`);
                }
                logDev('');
            }
            logDev('========================================\n');
            // Retornar também em formato JSON
            // logDev('JSON:', JSON.stringify(produtos, null, 2));
            return produtos;
        }
    } catch (e) {
        throw e;
    }

}
