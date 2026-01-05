import dayjs from "dayjs";
import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { AlmoxarifadoModel } from "../models/almoxarifado.model";
import { CaixaModel } from "../models/caixa.model";
import { COBRANCA_OPERACAO, COBRANCA_ORIGEM, COBRANCA_STATUS, CobrancaModel } from "../models/cobrancas.model";
import { CounterModel } from "../models/counter.model";
import { PESSOA_TIPO, PessoasModel } from "../models/pessoas.model";
import { PRODUTO_ESTOQUE_ORIGEM_MOVIMENTO, PRODUTO_ESTOQUE_TIPO_MOVIMENTO, ProdutosEstoqueMov } from "../models/produtos-estoque-mov.model";
import { ProdutosEstoqueModel } from "../models/produtos-estoque.model";
import { PRODUTOS_PECAS_STATUS_ESTOQUE, ProdutosPecasModel } from "../models/produtos-pecas.model";
import { PRODUTO_TIPO_SAIDA, ProdutosModel } from "../models/produtos.model";
import { VENDA_STATUS, VENDA_STATUS_ENTREGA, VENDA_STATUS_QUITACAO, VendasModel } from "../models/vendas.model";
import { errorHandler, logDev } from "../util";
import { inserirLancamentoFinanceiro } from "./financeiro.controller";
import { EmpresaModel } from "../models/empresa.model";

export default {
    getVendas: async (req: Request, res: Response, next: NextFunction) => {
        try {
            try {
                let { perpage, page, ...query } = req.query;

                let busca = req.query?.q || "";
                let lista: any = [], total = 0,
                    porpagina = 10, pagina = 0, skip = 0, limit = 0;

                if (perpage && page) {
                    porpagina = Number(perpage);
                    pagina = Number(page);
                    pagina--
                    skip = porpagina * pagina;
                    limit = porpagina;
                }

                let find: any = {
                    'empresa._id': req.empresa._id,
                    $or: [
                        { 'codigo': { $regex: busca, $options: 'i' } },
                        { 'cliente.nome': { $regex: busca, $options: 'i' } },
                        { 'cliente.documento': { $regex: busca, $options: 'i' } },
                        { 'cliente.razao_social': { $regex: busca, $options: 'i' } },
                    ]
                }
                if (!!query?.data_inicial && query?.data_final) {
                    find.data = {
                        $gte: dayjs(query.data_inicial as string).toDate(),
                        $lte: dayjs(query.data_final as string).toDate()
                    }
                }

                if (query?.status == "VALIDA") {
                    find['status'] = { $in: [VENDA_STATUS.ABERTA, VENDA_STATUS.CONCLUIDA] }
                }
                if (query?.status == "ABERTA") {
                    find['status'] = VENDA_STATUS.ABERTA;
                }
                if (query?.status == "CANCELADA") {
                    find['status'] = VENDA_STATUS.CANCELADA;
                }
                if (query?.status == 'CONCLUIDA') {
                    find['status'] = VENDA_STATUS.CONCLUIDA;
                }
                total = await VendasModel.find(find).countDocuments();
                lista = await VendasModel.find(find)
                    .skip(skip)
                    .limit(limit)
                    .sort({ _id: -1 })
                    .lean();

                res.json({ lista, total })

            } catch (error) {
                errorHandler(error, res);
            }
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getVendaPorId: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let venda = await VendasModel.findOne({
                _id: req.params.id,
                'empresa._id': req.empresa._id
            }).lean();
            if (!venda) {
                throw new Error("Venda não encontrada");
            }
            // @ts-ignore
            venda.empresa = await EmpresaModel.findOne({ _id: venda?.empresa?._id }).lean();
            res.json(venda);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getPrecosPraticadosCliente: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let precos_praticados = await VendasModel.aggregate([
                {
                    $match: {
                        'cliente._id': req.params.id_cliente,
                        'empresa._id': String(req.empresa._id)
                    }
                },
                {
                    $sort: {
                        data: -1
                    }
                },
                {
                    $unwind: "$itens"
                },
                {
                    $group: {
                        _id: "$itens.produto._id",
                        produto_nome: { $first: { $concat: ["$itens.produto.sigla"] } },
                        produto_precos_praticados: {
                            $addToSet: "$itens.preco_unitario"
                        }
                    }
                },

            ])
            res.json(precos_praticados)
        } catch (error) {
            errorHandler(error, res);
        }
    },
    setVendaPDV: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let payload = {
                _id: req.body.nova_venda ? new mongoose.Types.ObjectId() : mongoose.Types.ObjectId.createFromHexString(req.body._id),
                codigo: req.body?.codigo || null,
                cliente: null as any,
                endereco: req.body.endereco_entrega,
                data: req.body.data,
                itens: [] as any[],
                total_peso: 0,
                total_quantidade: 0,
                total_volume: 0,
                fechar_venda: req.body.fechar_venda,
                parcelas: req.body.parcelas,
                status: req.body.fechar_venda ? VENDA_STATUS.CONCLUIDA : VENDA_STATUS.ABERTA,
                status_entrega: VENDA_STATUS_ENTREGA.NENHUM,
                status_quitacao: null,
                venda_na_conta: req.body?.venda_na_conta || false,
                observacao: req.body?.observacao || '',
                valor_bruto: req.body.subtotal,
                valor_desconto: req.body.total_desconto,
                valor_liquido: req.body.total,
            }
            if (req.body.venda_na_conta) {
                // @ts-ignore
                payload.status_quitacao = COBRANCA_STATUS.PENDENTE;
            }

            if (!!req.body?.cliente) {
                payload.cliente = await PessoasModel.findOne({
                    _id: req.body.cliente,
                    tipos: PESSOA_TIPO.CLIENTE,
                    'empresa._id': req.empresa._id
                }).lean();
            } else {
                payload.cliente = null;
            }

            if (!req.body?.cliente && req.body?.venda_na_conta) {
                throw new Error("Não é possível cadastrar uma venda na conta sem um cliente vinculado à venda.");
            }

            let almoxarifado_principal = await AlmoxarifadoModel.findOne({ 'empresa._id': req.empresa._id, principal: true }).lean();
            if (!almoxarifado_principal) {
                throw new Error("Almoxarifado principal não encontrado para a empresa.");
            }
            let caixa_principal = await CaixaModel.findOne({ 'empresa._id': req.empresa._id, principal: true }).lean();
            if (!caixa_principal) {
                throw new Error("Caixa principal não encontrado para a empresa.");
            }

            let isFechado = req.body.fechar_venda;
            let isNovaVenda = req.body.nova_venda;

            let itens: any[] = [], operacoes: any[] = [];

            if (isNovaVenda) {
                let _produtos_db = await ProdutosModel.find({
                    _id: { $in: req.body.itens.map((i: any) => i.produto._id) },
                    'empresa._id': req.empresa._id
                })
                for (let item of req.body.itens) {
                    let produto_db = _produtos_db.find(p => p._id.toString() === item.produto._id);
                    if (!produto_db) {
                        throw new Error(`Produto não encontrado: ${item.produto_id}`);
                    }
                    if (!isFechado) {
                        // DONE: Lógica do ESTOQUE_PADRAO.
                        if (produto_db?.tipo_saida == PRODUTO_TIPO_SAIDA.ESTOQUE_PADRAO) {
                            let __data = {
                                produto: produto_db,
                                almoxarifado: almoxarifado_principal,
                                empresa: req.empresa,
                            }
                            // Reservar o produto no almoxarifado principal
                            operacoes.push({
                                op: 'PRODUTO_ESTOQUE_RESERVA',
                                produto_id: produto_db._id,
                                almoxarifado_id: almoxarifado_principal?._id.toString(),
                                quantidade: item.quantidade,
                                data: __data,
                            })
                        }

                        // DONE: 
                        if (produto_db?.tipo_saida == PRODUTO_TIPO_SAIDA.ESTOQUE_PECA) {
                            // Reservar a peça no almoxarifado principal
                            let _peca = await ProdutosPecasModel.findOne({
                                _id: item.peca._id,
                                'empresa._id': req.empresa._id,
                            })
                            if (_peca?.status_estoque != PRODUTOS_PECAS_STATUS_ESTOQUE.EM_ESTOQUE) {
                                throw new Error(`A peça ${_peca?.sigla || _peca?.nome} ${_peca?.quantidade}${_peca?.unidade || ''} não está disponível em estoque.`);
                            }
                            let __data = {
                                peca: _peca,
                                produto: produto_db,
                                almoxarifado: almoxarifado_principal,
                                empresa: req.empresa,
                            }
                            // Reservar a peça
                            operacoes.push({
                                op: 'PRODUTO_ESTOQUE_RESERVA',
                                peca_id: _peca._id,
                                produto_id: produto_db._id,
                                almoxarifado_id: almoxarifado_principal?._id.toString(),
                                quantidade: _peca.peso,
                                data: __data,
                            })
                            // Não registrar a reserva
                            // ... ... ... ... ...
                            // Registrar a reserva da peça
                            operacoes.push({
                                op: "PRODUTO_PECA_STATUS",
                                peca_id: _peca._id,
                                novo_status: PRODUTOS_PECAS_STATUS_ESTOQUE.RESERVADO,
                                data: __data
                            })
                        }
                    }
                    if (isFechado) {
                        // DONE: Lógica do ESTOQUE_PADRAO.
                        if (produto_db?.tipo_saida == PRODUTO_TIPO_SAIDA.ESTOQUE_PADRAO) {
                            let __data = {
                                produto: produto_db,
                                almoxarifado: almoxarifado_principal,
                                empresa: req.empresa,
                            }
                            // Não reservar a peça, já subtrair direto e registrar o movimento
                            operacoes.push({
                                op: 'PRODUTO_ESTOQUE_BAIXA',
                                produto_id: produto_db._id,
                                almoxarifado_id: almoxarifado_principal?._id.toString(),
                                tipo: "SAIDA",
                                quantidade: item.quantidade,
                            })
                            operacoes.push({
                                op: 'PRODUTO_ESTOQUE_MOV_BAIXA',
                                produto_id: produto_db._id,
                                almoxarifado_id: almoxarifado_principal?._id.toString(),
                                tipo: "SAIDA",
                                quantidade: item.quantidade,
                                data: __data,
                            })
                        }
                        // DONE: 
                        if (produto_db?.tipo_saida == PRODUTO_TIPO_SAIDA.ESTOQUE_PECA) {
                            // Verificar se há peças disponíveis no almoxarifado principal
                            let _peca = await ProdutosPecasModel.findOne({
                                _id: item.peca._id,
                                'empresa._id': req.empresa._id,
                            })
                            if (_peca?.status_estoque != PRODUTOS_PECAS_STATUS_ESTOQUE.EM_ESTOQUE) {
                                throw new Error(`A peça ${_peca?.sigla || _peca?.nome} ${_peca?.quantidade}${_peca?.unidade || ''} não está disponível em estoque.`);
                            }
                            let __data = {
                                peca: _peca,
                                produto: produto_db,
                                almoxarifado: almoxarifado_principal,
                                empresa: req.empresa,
                            }
                            // Não reservar a peça, já subtrair direto e registrar o movimento
                            operacoes.push({
                                op: 'PRODUTO_ESTOQUE_BAIXA',
                                peca_id: _peca._id,
                                produto_id: produto_db._id,
                                almoxarifado_id: almoxarifado_principal?._id.toString(),
                                tipo: "SAIDA",
                                quantidade: _peca.peso,
                                data: __data,
                            })
                            operacoes.push({
                                op: 'PRODUTO_ESTOQUE_MOV_BAIXA',
                                produto_id: produto_db._id,
                                almoxarifado_id: almoxarifado_principal?._id.toString(),
                                tipo: "SAIDA",
                                quantidade: _peca.peso,
                                data: __data,
                            })
                            operacoes.push({
                                op: "PRODUTO_PECA_STATUS",
                                peca_id: _peca._id,
                                novo_status: PRODUTOS_PECAS_STATUS_ESTOQUE.VENDIDO,
                                data: __data
                            })
                            logDev("CAIU AQUI!!");
                        }
                    }
                    itens.push(item);
                }
            } else {
                let __venda = await VendasModel.findOne({ _id: req.body._id }).lean();
                if (!__venda) {
                    throw new Error("Venda não encontrada para atualização dos itens.");
                }
                let indexedItens = {};
                let _previousItens = __venda.itens;
                for (let pi of _previousItens) {
                    // @ts-ignore
                    indexedItens[pi.produto._id] = 1;
                }
                for (let ni of req.body.itens) {
                    // @ts-ignore
                    if (!indexedItens[ni.produto._id]) {
                        // @ts-ignore
                        indexedItens[ni.produto._id] = 1;
                    }
                }
                let _produtos_db = await ProdutosModel.find({ _id: { $in: Object.keys(indexedItens) }, 'empresa._id': req.empresa._id }).lean();
                // 1. Compare _previousItens com req.body.itens, verificar se tem algum faltando ou a quantidade mudou
                for (let item of req.body.itens) {
                    let _produto_db = _produtos_db.find(p => p._id.toString() === item.produto._id);
                    if (!_produto_db) {
                        throw new Error(`Produto não encontrado: ${item.produto_id}`);
                    }
                    if (_produto_db?.tipo_saida == PRODUTO_TIPO_SAIDA.ESTOQUE_PADRAO) {
                        let _previousItem = _previousItens.find(pi => pi.produto?._id === item.produto._id);
                        if (_previousItem) {
                            // Item já existia, verificar se a quantidade mudou
                            // @ts-ignore;
                            let qtdDiff = item.quantidade - _previousItem.quantidade;
                            if (qtdDiff != 0) {
                                if (isFechado) {
                                    // Baixa a quantidade que existia antes, e agora faz uma nova baixa com a nova quantidade
                                    let __data = {
                                        produto: _produto_db,
                                        almoxarifado: almoxarifado_principal,
                                        empresa: req.empresa,
                                    }
                                    // Reverter a baixa anterior, tirar do reservado e adicionar no estoque
                                    operacoes.push({
                                        op: "PRODUTO_ESTOQUE_LIBERAR_RESERVA",
                                        produto_id: _produto_db._id,
                                        quantidade: _previousItem.quantidade,
                                        almoxarifado_id: almoxarifado_principal?._id.toString(),
                                        data: __data
                                    })
                                    // Fazer a nova baixa, direto sem reservar pois a venda vai fechar
                                    operacoes.push({
                                        op: 'PRODUTO_ESTOQUE_BAIXA',
                                        produto_id: _produto_db._id,
                                        almoxarifado_id: almoxarifado_principal?._id.toString(),
                                        tipo: "SAIDA",
                                        quantidade: item.quantidade,

                                    })
                                } else {
                                    // A venda não vai fechar, então só ajustar a reserva
                                    let __data = {
                                        produto: _produto_db,
                                        almoxarifado: almoxarifado_principal,
                                        empresa: req.empresa,
                                    }
                                    // Reverter a baixa anterior, tirar do reservado e adicionar no estoque
                                    operacoes.push({
                                        op: "PRODUTO_ESTOQUE_LIBERAR_RESERVA",
                                        produto_id: _produto_db._id,
                                        quantidade: _previousItem.quantidade,
                                        almoxarifado_id: almoxarifado_principal?._id.toString(),
                                        data: __data
                                    })
                                    // Fazer a nova reserva com a nova quantidade
                                    operacoes.push({
                                        op: 'PRODUTO_ESTOQUE_RESERVA',
                                        produto_id: _produto_db._id,
                                        almoxarifado_id: almoxarifado_principal?._id.toString(),
                                        quantidade: item.quantidade,
                                        data: __data,
                                    })
                                }
                            } else {
                                // A quantidade não mudou, se fechar
                                if (isFechado) {
                                    let __data = {
                                        produto: _produto_db,
                                        almoxarifado: almoxarifado_principal,
                                        empresa: req.empresa,
                                    }
                                    // Registrar o movimento de baixa, pois a reserva já foi feita antes
                                    operacoes.push({
                                        op: 'PRODUTO_ESTOQUE_MOV_BAIXA',
                                        produto_id: _produto_db._id,
                                        almoxarifado_id: almoxarifado_principal?._id.toString(),
                                        tipo: "SAIDA",
                                        quantidade: item.quantidade,
                                        data: __data,
                                    })
                                    // Baixar a reserva 
                                    operacoes.push({
                                        op: "PRODUTO_ESTOQUE_BAIXA_RESERVA",
                                        produto_id: _produto_db._id,
                                        quantidade: item.quantidade,
                                        almoxarifado_id: almoxarifado_principal?._id.toString(),
                                        data: __data
                                    })
                                    logDev('Quantidade do item não mudou, mas a venda vai fechar, registrar movimento de baixa e baixar a reserva.');
                                } else {
                                    logDev("Quantidade do item não mudou e a venda não vai fechar, nenhuma ação necessária.");
                                }
                            }
                        } else {
                            // Item novo, fazer a reserva ou baixa dependendo do status da venda
                            let __data = {
                                produto: _produto_db,
                                almoxarifado: almoxarifado_principal,
                                empresa: req.empresa,
                            }
                            if (isFechado) {
                                // Baixar direto do estoque e salvar o movimento de saida
                                operacoes.push({
                                    op: 'PRODUTO_ESTOQUE_BAIXA',
                                    produto_id: _produto_db._id,
                                    almoxarifado_id: almoxarifado_principal?._id.toString(),
                                    tipo: "SAIDA",
                                    quantidade: item.quantidade,
                                    data: __data,
                                })
                                operacoes.push({
                                    op: 'PRODUTO_ESTOQUE_MOV_BAIXA',
                                    produto_id: _produto_db._id,
                                    almoxarifado_id: almoxarifado_principal?._id.toString(),
                                    tipo: "SAIDA",
                                    quantidade: item.quantidade,
                                    data: __data,
                                })
                            } else {
                                // Fazer a reserva
                                operacoes.push({
                                    op: 'PRODUTO_ESTOQUE_RESERVA',
                                    produto_id: _produto_db._id,
                                    almoxarifado_id: almoxarifado_principal?._id.toString(),
                                    quantidade: item.quantidade,
                                    data: __data,
                                })
                            }
                        }

                    }
                    if (_produto_db?.tipo_saida == PRODUTO_TIPO_SAIDA.ESTOQUE_PECA) {
                        let _previousItem = _previousItens.find(pi => pi.peca?._id === item.peca._id);
                        if (_previousItem) {
                            // Item já existia, verificar se a quantidade mudou
                            if (isFechado) {
                                // Essa peça deve ser marcada como VENDIDA,
                                operacoes.push({
                                    op: "PRODUTO_PECA_STATUS",
                                    peca_id: item.peca._id,
                                    novo_status: PRODUTOS_PECAS_STATUS_ESTOQUE.VENDIDO,
                                    data: {
                                        peca: item.peca,
                                        produto: _produto_db,
                                        almoxarifado: almoxarifado_principal,
                                        empresa: req.empresa,
                                    }
                                })
                                // baixar a reserva
                                operacoes.push({
                                    op: "PRODUTO_ESTOQUE_BAIXA_RESERVA",
                                    produto_id: _produto_db._id,
                                    quantidade: item.quantidade,
                                    almoxarifado_id: almoxarifado_principal?._id.toString(),
                                    data: {
                                        produto: _produto_db,
                                        almoxarifado: almoxarifado_principal,
                                        empresa: req.empresa,
                                    }
                                })
                                // lançar o movimento de saída
                                operacoes.push({
                                    op: 'PRODUTO_ESTOQUE_MOV_BAIXA',
                                    produto_id: _produto_db._id,
                                    almoxarifado_id: almoxarifado_principal?._id.toString(),
                                    tipo: "SAIDA",
                                    quantidade: item.quantidade,
                                    data: {
                                        produto: _produto_db,
                                        almoxarifado: almoxarifado_principal,
                                        empresa: req.empresa,
                                    }
                                })
                                logDev("[ESTOQUE_PECA] Venda fechada, peça já existia, marcar como VENDIDO e lançar movimento de saída.");
                            }
                        } else {
                            // Item novo, fazer a reserva ou baixa dependendo do status da venda
                            let _peca = await ProdutosPecasModel.findOne({
                                _id: item.peca._id,
                                'empresa._id': req.empresa._id,
                            })
                            if (_peca?.status_estoque != PRODUTOS_PECAS_STATUS_ESTOQUE.EM_ESTOQUE) {
                                throw new Error(`A peça ${_peca?.sigla || _peca?.nome} ${_peca?.quantidade}${_peca?.unidade || ''} não está disponível em estoque.`);
                            }
                            let __data = {
                                peca: _peca,
                                produto: _produto_db,
                                almoxarifado: almoxarifado_principal,
                                empresa: req.empresa,
                            }
                            if (isFechado) {
                                // Baixa direta
                                operacoes.push({
                                    op: 'PRODUTO_ESTOQUE_BAIXA',
                                    peca_id: _peca._id,
                                    produto_id: _produto_db._id,
                                    almoxarifado_id: almoxarifado_principal?._id.toString(),
                                    tipo: "SAIDA",
                                    quantidade: _peca.peso,
                                    data: __data,
                                })
                                operacoes.push({
                                    op: 'PRODUTO_ESTOQUE_MOV_BAIXA',
                                    produto_id: _produto_db._id,
                                    almoxarifado_id: almoxarifado_principal?._id.toString(),
                                    tipo: "SAIDA",
                                    quantidade: _peca.peso,
                                    data: __data,
                                })
                                operacoes.push({
                                    op: "PRODUTO_PECA_STATUS",
                                    peca_id: _peca._id,
                                    novo_status: PRODUTOS_PECAS_STATUS_ESTOQUE.VENDIDO,
                                    data: __data
                                })
                            } else {
                                // Reserva
                                operacoes.push({
                                    op: 'PRODUTO_ESTOQUE_RESERVA',
                                    peca_id: _peca._id,
                                    produto_id: _produto_db._id,
                                    almoxarifado_id: almoxarifado_principal?._id.toString(),
                                    quantidade: _peca.peso,
                                    data: __data,
                                })
                                operacoes.push({
                                    op: "PRODUTO_PECA_STATUS",
                                    peca_id: _peca._id,
                                    novo_status: PRODUTOS_PECAS_STATUS_ESTOQUE.RESERVADO,
                                    data: __data
                                })
                            }
                        }
                    }
                    itens.push(item);
                }
                // 2. Verificar os itens anteriores, se algum foi removido
                for (let item of _previousItens) {
                    let _produto_db = _produtos_db.find(p => p._id.toString() === item.produto?._id);
                    if (!_produto_db) {
                        throw new Error(`Produto não encontrado: ${item.produto?._id}`);
                    }
                    if (_produto_db?.tipo_saida == PRODUTO_TIPO_SAIDA.ESTOQUE_PADRAO) {
                        let _newItem = req.body.itens.find((ni: any) => ni.produto?._id === item.produto?._id);
                        if (!_newItem) {
                            // Item removido, só liberar a reserva, não precisa reverter a baixa, pois a venda não estava fechada.
                            let __data = {
                                produto: _produto_db,
                                almoxarifado: almoxarifado_principal,
                                empresa: req.empresa,
                            }
                            // Venda vai fechar, o produto foi removido, então tirar do saldo_estoque_reservado e aumentar o saldo_estoque
                            operacoes.push({
                                op: "PRODUTO_ESTOQUE_LIBERAR_RESERVA",
                                produto_id: _produto_db._id,
                                quantidade: item.quantidade,
                                almoxarifado_id: almoxarifado_principal?._id.toString(),
                                data: __data
                            })
                        }
                    }
                    if (_produto_db?.tipo_saida == PRODUTO_TIPO_SAIDA.ESTOQUE_PECA) {
                        let _newItem = req.body.itens.find((ni: any) => ni.peca?._id === item.peca?._id);
                        if (!_newItem) {
                            // Item removido, liberar a reserva ou reverter a baixa dependendo do status da venda
                            let _peca = await ProdutosPecasModel.findOne({ _id: item.peca?._id, 'empresa._id': req.empresa._id, })
                            let __data = {
                                peca: _peca,
                                produto: _produto_db,
                                almoxarifado: almoxarifado_principal,
                                empresa: req.empresa,
                            }
                            // Verificar o status da venda para decidir a operação
                            if (isFechado) {
                                // Mudar o status da peça
                                operacoes.push({
                                    op: "PRODUTO_PECA_STATUS",
                                    peca_id: _peca?._id,
                                    novo_status: PRODUTOS_PECAS_STATUS_ESTOQUE.EM_ESTOQUE,
                                    data: __data
                                })
                                // Remover a reserva e adicionar no estoque
                                operacoes.push({
                                    op: "PRODUTO_ESTOQUE_LIBERAR_RESERVA",
                                    produto_id: _produto_db._id,
                                    quantidade: _peca?.peso
                                })
                            } else {
                                // Mudar o status da peça
                                operacoes.push({
                                    op: "PRODUTO_PECA_STATUS",
                                    peca_id: _peca?._id,
                                    novo_status: PRODUTOS_PECAS_STATUS_ESTOQUE.EM_ESTOQUE,
                                    data: __data
                                })
                                // Remover de reservado e adicionar no estoque
                                operacoes.push({
                                    op: "PRODUTO_ESTOQUE_LIBERAR_RESERVA",
                                    produto_id: _produto_db._id,
                                    quantidade: _peca?.peso
                                })
                            }
                        }
                    }
                }
            }
            payload.itens = itens;

            // Aplicar desconto proporcional nos itens
            if (payload.valor_desconto > 0 && payload.itens.length > 0) {
                let total_bruto = payload.itens.reduce((acc: number, item: any) => acc + item.valor_total, 0);
                let desconto_aplicado = 0;

                // Aplicar desconto proporcional em cada item
                for (let i = 0; i < payload.itens.length; i++) {
                    let item = payload.itens[i];

                    if (i === payload.itens.length - 1) {
                        // Último item: aplicar o restante do desconto para evitar problemas de arredondamento
                        item.valor_desconto = payload.valor_desconto - desconto_aplicado;
                    } else {
                        // Calcular desconto proporcional baseado no valor do item
                        let proporcao = item.valor_total / total_bruto;
                        item.valor_desconto = Math.round(payload.valor_desconto * proporcao * 100) / 100;
                        desconto_aplicado += item.valor_desconto;
                    }

                    // Atualizar preço unitário com desconto aplicado
                    let valor_com_desconto = item.valor_total - item.valor_desconto;
                    item.preco_unitario = Math.round((valor_com_desconto / item.quantidade) * 100) / 100;
                    item.valor_total_liquido = valor_com_desconto;
                }

                logDev("Desconto aplicado proporcionalmente nos itens da venda");
            } else {
                // Sem desconto, garantir que os campos existam
                for (let item of payload.itens) {
                    item.valor_desconto = 0;
                    item.valor_total_liquido = item.valor_total;
                }
            }

            if (payload.parcelas.length > 0) {
                let soma_parcelas = payload.parcelas.reduce((acc: number, parcela: any) => acc + parcela.valor, 0);
                if (Math.abs(soma_parcelas - payload.valor_liquido) > 0.01) {
                    throw new Error(`O valor total das parcelas (${soma_parcelas.toFixed(2)}) não confere com o valor líquido da venda (${payload.valor_liquido.toFixed(2)}).`);
                }
                // Verificar se alguma dessas parcelas é AVISTA
                for (let p of payload.parcelas) {
                    if (!p?.avista && !payload?.cliente?._id && isFechado) {
                        throw new Error("Não é possível cadastrar uma parcela a prazo sem um cliente vinculado à venda.");
                    }
                }

            }
            let doc = null;

            if (isNovaVenda) {
                // Gera um código
                let seq: any = await CounterModel.findOneAndUpdate(
                    { nome: 'codigo_vendas_pdv', 'empresa._id': req.empresa._id },
                    { $inc: { seq: 1 } },
                    { new: true, upsert: true }
                );
                payload.codigo = seq.seq.toString().padStart(6, '0');
                logDev("Novo código de venda PDV gerado:", payload.codigo);
            }

            if (!isNovaVenda) {
                // Atualizar venda
                doc = await VendasModel.findOne({ _id: req.body._id, 'empresa._id': req.empresa._id });
                if (!doc) throw new Error("Venda não encontrada para atualização");
                // @ts-ignore
                payload.atualizado_por = {
                    data_hora: dayjs().toDate(),
                    usuario: req.usuario
                }
                doc = await VendasModel.findOneAndUpdate({ _id: req.body._id, 'empresa._id': req.empresa._id }, { $set: { ...payload } });
            } else {
                // @ts-ignore
                payload.criado_por = {
                    data_hora: dayjs().toDate(),
                    usuario: req.usuario
                }
                doc = new VendasModel({ ...payload, empresa: req.empresa });
                await doc.save();
            }

            if (isFechado) {
                // Gerar cobranças para as parcelas
                let docs = [];
                for (let parcela of doc?.parcelas || []) {

                    let _payload_cob = {
                        _id: new mongoose.Types.ObjectId(),
                        data_emissao: dayjs(payload.data).toDate(),
                        data_vencimento: dayjs(parcela.data_vencimento).toDate(),
                        forma_pagamento: parcela.forma_pagamento?.nome || "Cobrança",
                        identificador: `VENDA ${payload.codigo} PARCELA ${parcela.numero_parcela}`,
                        origem: COBRANCA_ORIGEM.VENDA,
                        status: parcela?.forma_pagamento?.avista ? COBRANCA_STATUS.PAGA : COBRANCA_STATUS.PENDENTE,
                        operacao: COBRANCA_OPERACAO.CREDITO,
                        valor_recebido: parcela?.forma_pagamento?.avista ? parcela.valor : 0,
                        valor_bruto: parcela.valor,
                        valor_desconto: 0,
                        valor_juros: 0,
                        valor_total: parcela.valor,
                        venda: doc,
                        parcela: parcela.numero_parcela,
                        parcela_ref: parcela,
                        total_parcelas: parcela.total_parcelas,
                        lancamentos: [] as any[],
                        empresa: req.empresa
                    }
                    if (parcela?.forma_pagamento?.avista) {
                        _payload_cob.lancamentos.push({
                            data_lancamento: _payload_cob.data_emissao,
                            data_pagamento: _payload_cob.data_emissao,
                            forma_pagamento: parcela.forma_pagamento?.nome || "Cobrança",
                            valor: parcela.valor,
                            caixa: caixa_principal,
                            criado_por: {
                                data_hora: dayjs().toDate(),
                                usuario: req.usuario
                            }
                        })
                        inserirLancamentoFinanceiro({
                            tipo_lancamento: "VENDA_AVISTA",
                            venda: doc,
                            valor: parcela.valor,
                            empresa: req.empresa,
                        }, req.usuario, caixa_principal._id.toString())
                            .catch()
                    }
                    docs.push(new CobrancaModel(_payload_cob))
                }
                logDev("Gerando cobranças para a venda:", docs.length);
                await CobrancaModel.insertMany(docs);
            }
            for (let op of operacoes) {
                if (op.op === "PRODUTO_ESTOQUE_BAIXA_RESERVA") {
                    await ProdutosEstoqueModel.updateOne({
                        'produto._id': op.produto_id,
                        'empresa._id': req.empresa._id,
                        'almoxarifado._id': almoxarifado_principal?._id.toString(),
                    }, {
                        $inc: {
                            // @ts-ignore
                            saldo_estoque_reservado: op.quantidade * -1,
                        }
                    });
                }
                if (op.op === "PRODUTO_ESTOQUE_LIBERAR_RESERVA") {
                    await ProdutosEstoqueModel.updateOne({
                        'produto._id': op.produto_id,
                        'empresa._id': req.empresa._id,
                        'almoxarifado._id': almoxarifado_principal?._id.toString(),
                    }, {
                        $inc: {
                            // @ts-ignore
                            saldo_estoque_reservado: op.quantidade * -1,
                            // @ts-ignore
                            saldo_estoque: op.quantidade,
                        }
                    });
                }
                if (op.op === 'PRODUTO_ESTOQUE_RESERVA') {
                    // Reservar no estoque
                    await ProdutosEstoqueModel.updateOne({
                        'produto._id': op.produto_id,
                        'almoxarifado._id': op.almoxarifado_id,
                        'empresa._id': req.empresa._id,
                    }, {
                        $inc: {
                            // @ts-ignore
                            saldo_estoque_reservado: op.quantidade,
                            // @ts-ignore
                            saldo_estoque: op.quantidade * -1
                        }
                    });
                    logDev("Estoque do produto", op.produto_id, "no almoxarifado", op.almoxarifado_id, "reservado em", op.quantidade);
                }
                if (op.op === 'PRODUTO_ESTOQUE_BAIXA') {
                    // Baixa no estoque
                    await ProdutosEstoqueModel.updateOne({
                        'produto._id': op.produto_id,
                        'almoxarifado._id': op.almoxarifado_id,
                        'empresa._id': req.empresa._id,
                    }, {
                        $inc: {
                            // @ts-ignore
                            saldo_estoque: op.quantidade * -1
                        }
                    });
                    logDev("Estoque do produto", op.produto_id, "no almoxarifado", op.almoxarifado_id, "baixado em", op.quantidade);
                }
                if (op.op === 'PRODUTO_ESTOQUE_MOV_BAIXA') {
                    // Registrar movimento de baixa no estoque
                    let movimento = new ProdutosEstoqueMov({
                        produto: op.data.produto,
                        almoxarifado: op.data.almoxarifado,
                        tipo_movimento: PRODUTO_ESTOQUE_TIPO_MOVIMENTO.SAIDA,
                        origem_movimento: PRODUTO_ESTOQUE_ORIGEM_MOVIMENTO.VENDA,
                        quantidade: op.quantidade,
                        venda: doc,
                        empresa: req.empresa,
                    });
                    await movimento.save();
                    logDev("Movimento de baixa de estoque registrado para o produto", op.produto_id);
                }
                if (op.op === "PRODUTO_PECA_STATUS") {
                    // Atualizar status da peça
                    await ProdutosPecasModel.updateOne(
                        { _id: op.peca_id, 'empresa._id': req.empresa._id },
                        {
                            $set: {
                                status_estoque: op.novo_status,
                                venda: doc,
                            }
                        }
                    )
                    logDev("Peça", op.peca_id, "atualizada para o status", op.novo_status);
                }
            }

            res.json(doc?.toJSON())
        } catch (error) {
            errorHandler(error, res);
        }
    },
    desfazerProcessamentoVenda: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { id } = req.params;

            let venda = await VendasModel.findOne({ _id: id, 'empresa._id': req.empresa._id });
            if (!venda) {
                throw new Error("Venda não encontrada");
            }
            if (venda?.status != VENDA_STATUS.CONCLUIDA) {
                throw new Error("Somente vendas concluídas podem ter o processamento desfeito.");
            }
            if (venda?.status_quitacao !== VENDA_STATUS_QUITACAO.PENDENTE && venda?.venda_na_conta) {
                throw new Error("Não é possível desfazer o processamento de uma venda que foi quitada na conta do cliente.");
            }

            let almoxarifado_principal = await AlmoxarifadoModel.findOne({ 'empresa._id': req.empresa._id, principal: true }).lean();
            let ops = [];
            if (venda?.status == VENDA_STATUS.CONCLUIDA) {
                for (let item of venda.itens) {
                    if (item?.peca?._id) {
                        ops.push({
                            op: "PRODUTO_PECA_STATUS_ESTOQUE_AND_VENDA",
                            peca_id: item.peca._id,
                            novo_status: PRODUTOS_PECAS_STATUS_ESTOQUE.RESERVADO
                        })
                    }
                    ops.push({
                        op: "PRODUTO_ESTOQUE_ADD_RESERVA",
                        produto_id: item?.produto?._id,
                        quantidade: item.quantidade,
                    })
                    ops.push({
                        op: "PRODUTO_ESTOQUE_MOVIMENTO_REENTRADA",
                        produto_id: item?.produto?._id,
                        quantidade: item.quantidade,
                    })
                }
            }

            for (let op of ops) {
                if (op.op === "PRODUTO_PECA_STATUS_ESTOQUE_AND_VENDA") {
                    await ProdutosPecasModel.updateOne(
                        { _id: op.peca_id, 'empresa._id': req.empresa._id },
                        {
                            $set: {
                                status_estoque: op.novo_status,
                                venda: venda,
                            }
                        }
                    )
                }
                if (op.op === "PRODUTO_ESTOQUE_ADD_RESERVA") {
                    await ProdutosEstoqueModel.updateOne({
                        'produto._id': op.produto_id,
                        'empresa._id': req.empresa._id,
                        'almoxarifado._id': almoxarifado_principal?._id.toString(),
                    }, {
                        $inc: {
                            // @ts-ignore
                            saldo_estoque_reservado: op.quantidade
                        }
                    });
                }
                if (op.op === "PRODUTO_ESTOQUE_MOVIMENTO_REENTRADA") {
                    let movimento = new ProdutosEstoqueMov({
                        produto: { _id: op.produto_id },
                        almoxarifado: almoxarifado_principal,
                        tipo_movimento: PRODUTO_ESTOQUE_TIPO_MOVIMENTO.ENTRADA,
                        origem_movimento: PRODUTO_ESTOQUE_ORIGEM_MOVIMENTO.CANCELAMENTO_VENDA,
                        quantidade: op.quantidade,
                        venda: venda,
                        empresa: req.empresa,
                    });
                    await movimento.save();
                }
            }

            // Atualizar status da venda para ABERTA
            venda.status = VENDA_STATUS.ABERTA;
            venda.atualizado_por = {
                data_hora: dayjs().toDate(),
                usuario: req.usuario
            };
            await venda.save();

            logDev(`Processamento da venda ${venda.codigo || venda._id} desfeito com sucesso`);
            res.json({ message: "Processamento da venda desfeito com sucesso", venda: venda.toJSON() });

        } catch (error) {
            errorHandler(error, res);
        }
    },
    cancelarVenda: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { id } = req.params;
            let venda = await VendasModel.findOne({
                _id: id,
                'empresa._id': req.empresa._id
            });
            if (!venda) {
                throw new Error("Venda não encontrada!");
            }
            if (venda?.status != VENDA_STATUS.ABERTA) {
                throw new Error("A venda precisa estar ABERTA para ser cancelada.");
            }
            let ops = [];
            let almoxarifado_principal = await AlmoxarifadoModel.findOne({ 'empresa._id': req.empresa._id, principal: true }).lean();
            if (venda?.status == VENDA_STATUS.ABERTA) {
                for (let item of venda.itens) {
                    if (item?.peca?._id) {
                        // Liberar a peça reservada
                        ops.push({
                            op: "PRODUTO_PECA_STATUS_ESTOQUE",
                            peca_id: item.peca._id,
                            novo_status: PRODUTOS_PECAS_STATUS_ESTOQUE.EM_ESTOQUE,
                        });
                    }
                    ops.push({
                        op: "PRODUTO_ESTOQUE_LIBERAR_RESERVA",
                        produto_id: item?.produto?._id,
                        quantidade: item.quantidade,
                    })
                }
            }
            for (let op of ops) {
                if (op.op === "PRODUTO_PECA_STATUS_ESTOQUE") {
                    await ProdutosPecasModel.updateOne(
                        { _id: op.peca_id, 'empresa._id': req.empresa._id },
                        {
                            $set: {
                                status_estoque: op.novo_status,
                                venda: null,
                            }
                        }
                    )
                }
                if (op.op === "PRODUTO_ESTOQUE_LIBERAR_RESERVA") {
                    await ProdutosEstoqueModel.updateOne({
                        'produto._id': op.produto_id,
                        'empresa._id': req.empresa._id,
                        'almoxarifado._id': almoxarifado_principal?._id.toString(),
                    }, {
                        $inc: {
                            // @ts-ignore
                            saldo_estoque_reservado: op.quantidade * -1,
                            // @ts-ignore
                            saldo_estoque: op.quantidade,
                        }
                    });
                }
            }

            // Atualizar status da venda para CANCELADA
            venda.status = VENDA_STATUS.CANCELADA;
            venda.atualizado_por = {
                data_hora: dayjs().toDate(),
                usuario: req.usuario
            };
            await venda.save();
            logDev(`Venda ${venda.codigo || venda._id} cancelada com sucesso`);
            res.json({ message: "Venda cancelada com sucesso", venda: venda.toJSON() });
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getProdutosPDV: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { busca, perpage, page } = req.query;
            let porpagina = 10, pagina = 0, skip = 0, limit = 0;
            if (perpage && page) {
                porpagina = Number(perpage);
                pagina = Number(page);
                pagina--
                skip = porpagina * pagina;
                limit = porpagina;
            }
            let find: any = {
                'empresa._id': req.empresa._id,
            }
            if (!!busca) {
                find.$or = [
                    { 'nome': { $regex: busca, $options: 'i' } },
                ]
            }
            let sort: any = { prioridade: -1, _id: -1 }
            let lista: any = await ProdutosModel.find(find).sort(sort).skip(skip).limit(limit).lean();
            let almoxarifado_principal = await AlmoxarifadoModel.findOne({ 'empresa._id': req.empresa._id, principal: true }).lean();
            let produtos_estoques = await ProdutosEstoqueModel.find({
                'empresa._id': req.empresa._id,
                'produto._id': { $in: lista.map((p: any) => p._id.toString()) },
                'almoxarifado._id': almoxarifado_principal?._id?.toString(),
            }).lean();
            for (let produto of lista) {
                let estoque_principal = produtos_estoques.find(pe => pe?.produto?._id === produto._id.toString());
                produto.saldo_estoque = estoque_principal ? estoque_principal.saldo_estoque : 0;
            }

            res.json({ lista, total: lista.length })
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getPecasProdutoAlmoxarifado: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { produto_id, almoxarifado_id, status_estoque } = req.query;
            let find = {
                'empresa._id': req.empresa._id,
                'produto._id': produto_id,
                'almoxarifado._id': almoxarifado_id,
                'status_estoque': status_estoque || PRODUTOS_PECAS_STATUS_ESTOQUE.EM_ESTOQUE,
            }
            let pecas = await ProdutosPecasModel.find(find).lean();
            res.json({ pecas, lista: pecas });
        } catch (error) {
            errorHandler(error, res);
        }
    },
}