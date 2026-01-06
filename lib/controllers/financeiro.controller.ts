import dayjs from "dayjs";
import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { CAIXA_TIPO_DESCRICAO_OPERACAO, CAIXA_TIPO_OPERACAO, CaixaMovimentoModel } from "../models/caixa-mov.model";
import { CaixaModel } from "../models/caixa.model";
import { COBRANCA_OPERACAO, COBRANCA_ORIGEM, COBRANCA_STATUS, CobrancaModel } from "../models/cobrancas.model";
import { FormasPagamentoModel } from "../models/formas-pagamento.model";
import { PessoasModel } from "../models/pessoas.model";
import { RECEBIMENTO_LANCAMENTO_TIPO, RecebimentosModel } from "../models/recebimentos.model";
import { VENDA_STATUS, VENDA_STATUS_QUITACAO, VendasModel } from "../models/vendas.model";
import { errorHandler, getCdnLink, logDev, MoneyBRL } from "../util";
import { EmpresaModel } from "../models/empresa.model";
import fs from 'fs';

async function getValorPendenteCliente(cliente_id: string) {

    let valor_total = 0,
        valor_pendente = 0,
        valor_recebido = 0;

    let totais = await VendasModel.aggregate([
        {
            $match: {
                'cliente._id': cliente_id,
                'venda_na_conta': true,
                'status': {
                    $in: [
                        VENDA_STATUS.CONCLUIDA
                    ]
                }
            }
        },
        {
            $group: {
                _id: null,
                valor_total: { $sum: "$valor_liquido" },
                valor_recebido: { $sum: "$valor_recebido" },
                vendas: {
                    $push: {
                        _id: "$_id",
                        valor_liquido: "$valor_liquido",
                        valor_recebido: "$valor_recebido",
                    }
                }
            }
        }
    ])
    if (totais?.length) {
        valor_total = totais[0].valor_total;
        valor_recebido = totais[0].valor_recebido;
        valor_pendente = valor_total - valor_recebido;
    }
    return {
        valor_total,
        valor_pendente,
        valor_recebido,
        lista_vendas: totais?.length ? totais[0].vendas : []
    }
}

export async function getRecebimentosByClienteId(id_cliente: string, empresa_id: string, apenas_abertas: boolean = false) {
    try {
        let find: any = {
            'empresa._id': String(empresa_id),
            'cliente._id': id_cliente,
            'venda_na_conta': true,
            'status': VENDA_STATUS.CONCLUIDA,
        }
        if (apenas_abertas) {
            find['status_quitacao'] = {
                $in: [VENDA_STATUS_QUITACAO.PENDENTE, VENDA_STATUS_QUITACAO.PARCIAL]
            }
        }
        let pessoa = await PessoasModel.findOne({ _id: id_cliente }, {
            nome: 1,
            doc_type: 1,
            documento: 1,
            razao_social: 1,
            dias_cobranca: 1,
            telefone_principal: 1,
            empresa: 1,
        }).lean();

        let valor_total = 0,
            valor_total_em_aberto = 0,
            valor_total_em_atraso = 0,
            saldo_devedor = 0,
            saldo_devedor_sem_pendencias = 0,
            valor_recebido = 0;

        let vendas = await VendasModel.find(find).sort({ data: 1 }).lean();
        valor_total = vendas.reduce((acc, v) => acc + (v.valor_liquido || 0), 0);
        let ids_vendas = vendas.map(v => v._id.toString());


        let indexed: { [key: string]: any } = {};
        for (let v of vendas) {
            // Total a vencer apenas considerando vendas com dias_cobranca
            valor_recebido += (v.valor_recebido || 0);
            if (pessoa?.dias_cobranca) {
                // @ts-ignore
                let data_vencimento = dayjs(v.data).add(pessoa?.dias_cobranca || 0, 'day');
                let valor_em_aberto_venda = (v.valor_liquido || 0) - (v.valor_recebido || 0);

                // Aplicar epsilon para imprecisões de ponto flutuante
                const eps = 0.01;
                if (Math.abs(valor_em_aberto_venda) < eps) {
                    valor_em_aberto_venda = 0;
                }

                // Se a data ja passou e ainda tem valor a receber
                if (data_vencimento.isBefore(dayjs(), 'day') && valor_em_aberto_venda > 0) {
                    valor_total_em_atraso += valor_em_aberto_venda;
                } else if (valor_em_aberto_venda > 0) {
                    valor_total_em_aberto += valor_em_aberto_venda;
                }
            } else {
                let valor_em_aberto_venda = (v.valor_liquido || 0) - (v.valor_recebido || 0);

                // Aplicar epsilon para imprecisões de ponto flutuante
                const eps = 0.01;
                if (Math.abs(valor_em_aberto_venda) < eps) {
                    valor_em_aberto_venda = 0;
                }

                if (valor_em_aberto_venda > 0) {
                    valor_total_em_aberto += valor_em_aberto_venda;
                }
            }

            for (let p of v.itens) {
                let data_formatada: string = (v.data?.toISOString().split('T')[0]) || '';
                if (!indexed[data_formatada]) {
                    indexed[data_formatada] = {
                        venda_id: v._id,
                        venda_codigo: v.codigo,
                        venda_data: v.data,
                        valor_total: 0,
                        valor_em_aberto: 0,
                        valor_em_atraso: 0,
                        valor_recebido: 0,
                        produtos: {}
                    }
                }
                indexed[data_formatada].valor_total += p.valor_total_liquido || 0;
                indexed[data_formatada].valor_recebido += (v.valor_recebido || 0) * ((p.valor_total_liquido || 0) / (v.valor_liquido || 1));
                let valor_em_aberto_item = (p.valor_total_liquido || 0) - ((v.valor_recebido || 0) * ((p.valor_total_liquido || 0) / (v.valor_liquido || 1)));

                // Aplicar epsilon para valores muito pequenos (imprecisões de ponto flutuante)
                const eps = 0.01;
                if (Math.abs(valor_em_aberto_item) < eps) {
                    valor_em_aberto_item = 0;
                }

                indexed[data_formatada].valor_em_aberto += valor_em_aberto_item;
                let data_vencimento = pessoa?.dias_cobranca ? dayjs(v.data).add(pessoa?.dias_cobranca || 0, 'day') : null;
                if (data_vencimento && data_vencimento.isBefore(dayjs(), 'day') && valor_em_aberto_item > 0) {
                    indexed[data_formatada].valor_em_atraso += valor_em_aberto_item;
                }
                let produto_hash = `${p?.produto?._id}-${p.preco_unitario?.toFixed(2)}`
                if (p.produto?._id && !indexed[data_formatada].produtos[produto_hash]) {
                    indexed[data_formatada].produtos[produto_hash] = {
                        produto: p.produto,
                        produto_sigla: p.produto.sigla,
                        produto_sku: p.produto.sku,
                        pecas: [],
                        unidade_saida: p.unidade_saida,
                        valor_unitario: p.preco_unitario || 0,
                        total_unitario: 0,
                        quantidade: 0,
                        valor_total: 0,
                    }
                }

                if (p.peca?._id && p.produto?._id) {
                    indexed[data_formatada].produtos[produto_hash].pecas.push(p.peca);
                    indexed[data_formatada].produtos[produto_hash].total_unitario++
                }
                // @ts-ignore
                indexed[data_formatada].produtos[produto_hash].quantidade += p.quantidade || 0;
                // @ts-ignore
                indexed[data_formatada].produtos[produto_hash].valor_total += p.valor_total_liquido || 0;
            }
        }
        saldo_devedor = valor_total - valor_recebido;
        let find_recebimentos: any = {
            'empresa._id': String(empresa_id),
            'cliente._id': id_cliente,
        }
        if (apenas_abertas) find_recebimentos['lancamentos.venda._id'] = { $in: ids_vendas };
        let lista_recebimentos = await RecebimentosModel.find(find_recebimentos, { empresa: 0 }).sort({ data_pagamento: 1 }).lean();


        let lista_produtos_por_data = Object.keys(indexed).map(key => {
            indexed[key].produtos = Object.keys(indexed[key].produtos).map(produto_key => {
                return indexed[key].produtos[produto_key];
            })
            return {
                data: key,
                ...indexed[key],
            }
        })

        let url = getCdnLink();
        let endpoint = `/share/cliente/${id_cliente}/faturas`;

        let find_cobs_pendencias: any = {
            'origem': COBRANCA_ORIGEM.PENDENCIA_FINANCEIRA,
            'cliente._id': id_cliente,
            'empresa._id': String(pessoa?.empresa?._id)
        }
        if (apenas_abertas) {
            find_cobs_pendencias['status'] = {
                $in: [
                    COBRANCA_STATUS.PENDENTE
                ]
            }
        } else {
            find_cobs_pendencias['status'] = {
                $in: [
                    COBRANCA_STATUS.PAGA,
                    COBRANCA_STATUS.PENDENTE,
                ]
            }
        }
        let lista_pendencias_avulsas = await CobrancaModel.find(find_cobs_pendencias).lean();
        let valor_pendencias = 0;

        for (let cob of lista_pendencias_avulsas) {
            let valor_restante = (cob?.valor_total || 0) - (cob?.valor_recebido || 0);
            if (valor_restante > 0) {
                saldo_devedor += valor_restante;
                valor_pendencias += valor_restante;
            }
        }

        saldo_devedor_sem_pendencias = saldo_devedor - valor_pendencias;

        let _link = `${url}${endpoint}`;
        if (process.env.DEV === '1') {
            _link = `http://localhost:4242/cliente/${id_cliente}/faturas`;
        }
        return {
            pessoa,
            link: _link,
            empresa: await EmpresaModel.findOne({ _id: String(pessoa?.empresa?._id) }, { nome: 1, razao_social: 1, documento: 1, logo: 1, endereco: 1 }).lean(),
            lista_produtos_por_data,
            lista_recebimentos,
            lista_pendencias_avulsas,
            valor_total,
            valor_pendencias,
            valor_total_em_aberto,
            valor_total_em_atraso,
            saldo_devedor,
            saldo_devedor_sem_pendencias,
            valor_recebido
        }
    } catch (error) {
        throw error;
    }
}

export default {
    public: {
        getFaturasCliente: async (req: Request, res: Response, next: NextFunction) => {
            try {
                let { id } = req.params;
                let { customer, apenas_em_aberto } = req.query;
                let pessoa = await PessoasModel.findOne({ _id: id }, { 'empresa._id': 1 }).lean();
                if (!pessoa) {
                    throw new Error("Cliente não encontrado");
                }
                console.log(apenas_em_aberto);
                // @ts-ignore
                let data = await getRecebimentosByClienteId(id, pessoa.empresa._id, apenas_em_aberto);
                res.json(data);
            } catch (error) {
                errorHandler(error, res);
            }
        }
    },
    getListaRecebimentosByClienteId: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { id_cliente } = req.params;
            let recebimentos = await RecebimentosModel.find({
                'cliente._id': id_cliente,
                'empresa._id': String(req.empresa._id),
            });
            res.json(recebimentos);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    lancarRecebimento: async (req: Request, res: Response, next: NextFunction) => {
        try {
            logDev(JSON.stringify(req.body, null, 2));
            let { data_pagamento, forma_pagamento_id, cliente_id, valor } = req.body;
            let totais = await getValorPendenteCliente(cliente_id)

            if (valor > totais.valor_pendente) {
                throw new Error(`O valor do recebimento não pode ser maior que o valor pendente do cliente. Valor pendente: R$${MoneyBRL(totais.valor_pendente)}`);
            }
            let formaPagamento = await FormasPagamentoModel.findOne({
                'empresa._id': String(req.empresa._id),
                '_id': forma_pagamento_id
            })
            if (!formaPagamento) {
                throw new Error("Forma de pagamento não encontrada");
            }

            // Buscar vendas pendentes do cliente (ordenadas por data)
            let vendas = await VendasModel.find({
                'empresa._id': String(req.empresa._id),
                'cliente._id': cliente_id,
                'status': VENDA_STATUS.CONCLUIDA,
                'venda_na_conta': true,
                $expr: { $gt: [{ $subtract: ["$valor_liquido", { $ifNull: ["$valor_recebido", 0] }] }, 0] }
            }).sort({ data: 1 }).lean();

            if (vendas.length === 0) {
                throw new Error("Não há vendas pendentes para este cliente");
            }

            // Distribuir o valor do recebimento entre as vendas
            let valor_restante = valor;
            let lancamentos: any[] = [];

            for (let venda of vendas) {
                if (valor_restante <= 0) break;

                let valor_pendente_venda = (venda.valor_liquido || 0) - (venda.valor_recebido || 0);
                let valor_a_pagar = Math.min(valor_restante, valor_pendente_venda);

                // Adicionar ao array de lançamentos
                lancamentos.push({
                    tipo: RECEBIMENTO_LANCAMENTO_TIPO.RECEBIMENTO_VENDA,
                    venda: {
                        _id: String(venda._id),
                        codigo: venda.codigo,
                        data: venda.data
                    },
                    valor: valor_a_pagar
                });

                // Atualizar valor_recebido da venda
                let novo_valor_recebido = (venda.valor_recebido || 0) + valor_a_pagar;
                let status_quitacao = VENDA_STATUS_QUITACAO.PENDENTE;

                // @ts-ignore
                // Usar epsilon para comparação de valores monetários (tolerância de 1 centavo)
                const eps = 0.01;
                // @ts-ignore
                if (novo_valor_recebido >= (venda?.valor_liquido - eps)) {
                    status_quitacao = VENDA_STATUS_QUITACAO.QUITADA;
                } else if (novo_valor_recebido > 0) {
                    status_quitacao = VENDA_STATUS_QUITACAO.PARCIAL;
                }

                await VendasModel.updateOne(
                    { _id: venda._id },
                    {
                        $inc: { valor_recebido: valor_a_pagar },
                        $set: { status_quitacao: status_quitacao }
                    }
                );

                valor_restante -= valor_a_pagar;
            }

            let cliente = await PessoasModel.findOne({ _id: cliente_id, 'empresa._id': String(req.empresa._id) });

            // Criar o documento de recebimento
            let recebimento = new RecebimentosModel({
                data_pagamento: dayjs(data_pagamento).toDate(),
                cliente: cliente,
                forma_pagamento: {
                    _id: String(formaPagamento._id),
                    nome: formaPagamento.nome
                },
                valor: valor,
                criado_por: {
                    usuario: req.usuario,
                    data_hora: dayjs().toDate()
                },
                lancamentos: lancamentos,
                empresa: req.empresa
            });

            await recebimento.save();

            res.json({
                success: true,
                message: `Recebimento lançado com sucesso. Total: R$${MoneyBRL(valor)}`,
                recebimento
            });

        } catch (error) {
            errorHandler(error, res);
        }
    },
    estornarLancamentoRecebimento: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { id, id_lancamento } = req.params
            console.log("Estornando lançamento de recebimento", id, id_lancamento);
            let _id = mongoose.Types.ObjectId.createFromHexString(id);
            let lancamento_id = mongoose.Types.ObjectId.createFromHexString(id_lancamento);
            let [lancamento] = await RecebimentosModel.aggregate([
                { $match: { 'empresa._id': String(req.empresa._id), _id: _id } },
                { $unwind: "$lancamentos" },
                { $match: { 'lancamentos._id': lancamento_id } },
                { $project: { lancamentos: 1 } }
            ]);
            if (!lancamento) {
                throw new Error("Lançamento de recebimento não encontrado");
            }
            // Reverter o valor recebido na venda
            if (lancamento.lancamentos.venda?._id) {
                let venda = await VendasModel.findOne({ _id: lancamento.lancamentos.venda._id });
                if (venda) {
                    // @ts-ignore
                    let novo_valor_recebido = (venda.valor_recebido || 0) - lancamento.lancamentos.valor;
                    let status_quitacao = VENDA_STATUS_QUITACAO.PENDENTE;
                    // @ts-ignore
                    if (novo_valor_recebido >= venda.valor_liquido) {
                        status_quitacao = VENDA_STATUS_QUITACAO.QUITADA;
                    } else if (novo_valor_recebido > 0) {
                        status_quitacao = VENDA_STATUS_QUITACAO.PARCIAL;
                    }
                    await VendasModel.updateOne(
                        { _id: lancamento.lancamentos.venda._id },
                        {
                            // @ts-ignore
                            $inc: { valor_recebido: -lancamento.lancamentos.valor },
                            $set: { status_quitacao: status_quitacao }
                        }
                    );
                }
            }
            // Remover o lançamento do recebimento
            await RecebimentosModel.updateOne(
                { 'empresa._id': String(req.empresa._id), _id: _id },
                {
                    $inc: { valor: -lancamento.lancamentos.valor },
                    $pull: { lancamentos: { _id: lancamento_id } }
                }
            );
            res.json({
                success: true,
                message: `Lançamento de recebimento estornado com sucesso. Total: R$${MoneyBRL(lancamento.lancamentos.valor)}`
            });
        } catch (error) {
            errorHandler(error, res);
        }
    },
    estornarRecebimento: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { id } = req.params;

            // Buscar o recebimento
            let recebimento = await RecebimentosModel.findOne({
                'empresa._id': String(req.empresa._id),
                '_id': id
            });

            if (!recebimento) {
                throw new Error("Recebimento não encontrado");
            }

            // Reverter os valores recebidos nas vendas
            for (let lancamento of recebimento.lancamentos) {
                if (lancamento.venda?._id) {
                    // Buscar a venda para calcular o novo status
                    let venda = await VendasModel.findOne({ _id: lancamento.venda._id });
                    if (venda) {
                        // @ts-ignore
                        let novo_valor_recebido = (venda.valor_recebido || 0) - lancamento.valor;
                        let status_quitacao = VENDA_STATUS_QUITACAO.PENDENTE;

                        // @ts-ignore
                        if (novo_valor_recebido >= venda.valor_liquido) {
                            status_quitacao = VENDA_STATUS_QUITACAO.QUITADA;
                        } else if (novo_valor_recebido > 0) {
                            status_quitacao = VENDA_STATUS_QUITACAO.PARCIAL;
                        }

                        await VendasModel.updateOne(
                            { _id: lancamento.venda._id },
                            {
                                // @ts-ignore
                                $inc: { valor_recebido: -lancamento.valor },
                                $set: { status_quitacao: status_quitacao }
                            }
                        );
                    }
                }
            }

            // Remover o recebimento
            await RecebimentosModel.deleteOne({ _id: id });

            res.json({
                success: true,
                message: `Recebimento desfeito com sucesso. Total: R$${MoneyBRL(recebimento.valor)}`
            });

        } catch (error) {
            errorHandler(error, res);
        }
    },
    getPainelRecebimentosByCliente: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { id_cliente } = req.params;
            let { apenas_abertos } = req.query;
            let data = await getRecebimentosByClienteId(id_cliente, req.empresa._id, apenas_abertos == '1' ? true : false);
            res.json(data);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getPainelRecebimentos: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let total_clientes = 0,
                valor_total = 0,
                valor_total_em_aberto = 0,
                valor_total_em_atraso = 0;

            let pessoas = await PessoasModel.find({ 'empresa._id': String(req.empresa._id) }).sort({ nome: 1 }).lean();
            let $match = {
                'status': VENDA_STATUS.CONCLUIDA,
                'venda_na_conta': true,
                'status_quitacao': {
                    $in: [
                        VENDA_STATUS_QUITACAO.PARCIAL,
                        VENDA_STATUS_QUITACAO.PENDENTE,
                    ]
                },
                'empresa._id': String(req.empresa._id)
            }
            let resumo = await VendasModel.aggregate([
                { $match },
                { $sort: { data: 1 } },
                {
                    $group: {
                        _id: "$cliente._id",
                        nome: { $first: "$cliente.nome" },
                        documento: { $first: "$cliente.documento" },
                        valor_receber: { $sum: "$valor_liquido" },
                        valor_recebido: { $sum: "$valor_recebido" },
                        vendas: {
                            $push: {
                                _id: "$_id",
                                data: "$data",
                                codigo: "$codigo",
                                valor_receber: "$valor_liquido",
                                valor_recebido: "$valor_recebido",
                            }
                        }
                    }
                },
                {
                    $match: {
                        $expr: { $gt: [{ $subtract: ["$valor_receber", "$valor_recebido"] }, 0] }
                    }
                },
                {
                    $sort: {
                        nome: 1
                    }
                }
            ]);
            total_clientes = pessoas.length;
            let lista = pessoas.map((item) => ({
                _id: item._id,
                nome: item.nome,
                documento: item.documento,
                valor_receber: 0,
                valor_recebido: 0,
                pendencias: 0,
                valor_total_pendencias: 0,
                vendas: [],
                dias_em_atraso: 0,
                saldo_a_receber: 0,
            }))
            for (let item of resumo) {
                valor_total += item?.valor_receber || 0;
                let pessoa = pessoas.find(p => p._id.toString() === item._id.toString());
                for (let v of item.vendas) {
                    let dias_cobranca = pessoa?.dias_cobranca || 0;
                    if (dias_cobranca) {
                        // @ts-ignore
                        let data_vencimento = dayjs(v.data).add(dias_cobranca, 'day');
                        // Se a data ja passou e ainda tem valor a receber
                        if (((v.valor_receber || 0) - (v.valor_recebido || 0)) > 0 && data_vencimento.isBefore(dayjs(), 'day')) {
                            valor_total_em_atraso += (v.valor_receber || 0) - (v.valor_recebido || 0);
                        } else {
                            valor_total_em_aberto += (v.valor_receber || 0) - (v.valor_recebido || 0);
                        }
                    } else {
                        valor_total_em_aberto += (v.valor_receber || 0) - (v.valor_recebido || 0);
                    }
                }
                if (pessoa?.dias_cobranca) {
                    let dias_em_atraso = 0;
                    for (let v of item.vendas) {
                        let data_vencimento = dayjs(v.data).add(pessoa?.dias_cobranca || 0, 'day');
                        if (((item.valor_receber || 0) - (item.valor_recebido || 0)) > 0 && data_vencimento.isBefore(dayjs(), 'day')) {
                            let dias_atraso_venda = dayjs().diff(data_vencimento, 'day');
                            if (dias_atraso_venda > dias_em_atraso) {
                                dias_em_atraso = dias_atraso_venda;
                            }
                        }
                    }
                    item.dias_em_atraso = dias_em_atraso
                }
                let index = lista.findIndex(i => i._id.toString() === item._id.toString());
                if (index >= 0) {
                    lista[index].valor_receber = item.valor_receber;
                    lista[index].valor_recebido = item.valor_recebido;
                    lista[index].vendas = item.vendas;
                    lista[index].dias_em_atraso = item.dias_em_atraso;
                    lista[index].saldo_a_receber = (item.valor_receber || 0) - (item.valor_recebido || 0);
                }
            }
            // Pendencias financeiras
            let valor_total_pendencias = 0;
            let cobrancas = await CobrancaModel.find({ 'origem': COBRANCA_ORIGEM.PENDENCIA_FINANCEIRA, 'empresa._id': String(req.empresa._id) }).lean();
            for (let cob of cobrancas) {
                let valor_restante = (cob?.valor_total || 0) - (cob?.valor_recebido || 0);
                if (valor_restante > 0) {
                    valor_total += valor_restante;
                    valor_total_em_aberto += valor_restante;
                    valor_total_pendencias += valor_restante;
                    // @ts-ignore
                    let index = lista.findIndex(i => i._id.toString() === cob.cliente._id.toString());
                    if (index >= 0) {
                        lista[index].pendencias += 1;
                        lista[index].valor_receber += valor_restante;
                        lista[index].valor_total_pendencias += valor_restante;
                        lista[index].saldo_a_receber += valor_restante;
                    }
                }
            }

            res.json({
                lista,
                total_clientes,
                valor_total,
                valor_total_em_aberto,
                valor_total_em_atraso,
            })
        } catch (error) {
            errorHandler(error, res);
        }
    },

    getCaixas: async (req: Request, res: Response, next: NextFunction) => {
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
            }
            if (!!busca) {
                find.$or = [
                    { nome: { $regex: busca, $options: 'i' } },
                ]
            }

            total = await CaixaModel.find(find).countDocuments();
            lista = await CaixaModel.find(find)
                .skip(skip)
                .limit(limit)
                .sort({ _id: -1 })
                .lean();

            res.json({ lista, total })
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getCaixaById: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let caixa = await CaixaModel.findOne({
                'empresa._id': req.empresa._id,
                _id: req.params.id
            });
            if (!caixa) throw new Error("Caixa não encontrado");
            res.json(caixa);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getCaixaLancamentos: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { perpage, page, data_inicial, data_final, ...query } = req.query;

            let extrato: any[] = [];

            let find: any = {
                'empresa._id': String(req.empresa._id),
                'caixa._id': req.params.id,
            }
            if (data_inicial && data_final) {
                find.data = {
                    $gte: dayjs(data_inicial as string).startOf('day').toDate(),
                    $lte: dayjs(data_final as string).startOf('day').toDate(),
                }
            }
            let lancamentos = await CaixaMovimentoModel.find(find).lean();

            let saldo_dia: any = {};
            let consolidado_operacao: any = {};
            let consolidado_descricao: any = {};

            for (let item of lancamentos) {
                let data_string: string = dayjs(item.data).format('YYYY-MM-DD')
                if (!saldo_dia[data_string]) {
                    saldo_dia[data_string] = 0;
                }
                saldo_dia[data_string] += item.valor;
                if (!consolidado_operacao[item?.tipo_operacao || '']) {
                    consolidado_operacao[item?.tipo_operacao || ''] = 0;
                }
                consolidado_operacao[item?.tipo_operacao || ''] += item.valor;

                if (!consolidado_descricao[item?.descricao || '']) {
                    consolidado_descricao[item?.descricao || ''] = 0;
                }
                consolidado_descricao[item?.descricao || ''] += item.valor;

                let _payload: any = {
                    data: item.data,
                    label: item.descricao,
                    tipo_operacao: item.tipo_operacao,
                    valor: item.valor,
                    criado_por: item.criado_por
                }
                if (!!item?.nota?._id) {
                    _payload['nota'] = item.nota;
                }
                if (!!item?.venda?._id) {
                    _payload['venda'] = item.venda;
                }
                extrato.push(_payload);
            }

            res.json({
                lista: extrato,
                consolidado_operacao: Object.keys(consolidado_operacao).map(key => ({
                    tipo_operacao: key,
                    valor: consolidado_operacao[key]
                })),
                consolidado_descricao: Object.keys(consolidado_descricao).map(key => ({
                    descricao: key,
                    valor: consolidado_descricao[key]
                }))
            })
        } catch (error) {
            errorHandler(error, res);
        }
    },
    postCaixa: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let payload: any = {
                nome: req.body.nome,
                principal: req.body.principal || false,
            }
            let doc = null;

            if (!!req.body?._id) {
                // Precisamos verificar se já tem algum caixa principal
                if (req.body.principal) {
                    let caixaPrincipal = await CaixaModel.findOne({
                        'empresa._id': req.empresa._id,
                        principal: true,
                        _id: { $ne: req.body._id }
                    });
                    if (caixaPrincipal) {
                        throw new Error("Já existe um caixa principal definido.");
                    }
                }
                doc = await CaixaModel.findOneAndUpdate({
                    'empresa._id': req.empresa._id,
                    _id: req.body._id
                }, {
                    $set: {
                        ...payload,
                        atualizado_por: {
                            data_hora: dayjs().toDate(),
                            usuario: req.usuario
                        }
                    }
                }, {
                    new: true, upsert: true
                });
            } else {
                // Precisamos verificar se já tem algum caixa principal
                if (req.body.principal) {
                    let caixaPrincipal = await CaixaModel.findOne({
                        'empresa._id': req.empresa._id,
                        principal: true,
                    });
                    if (caixaPrincipal) {
                        throw new Error("Já existe um caixa principal definido.");
                    }
                }
                payload.empresa = req.empresa;
                payload.criado_por = {
                    data_hora: dayjs().toDate(),
                    usuario: req.usuario
                }
                doc = new CaixaModel(payload);
                await doc.save()
            }
            res.json(doc)
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getContasPagar: async (req: Request, res: Response, next: NextFunction) => {
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
                'operacao': COBRANCA_OPERACAO.DEBITO
            }
            if (!!busca) {
                find.$or = [
                    { 'identificador': { $regex: busca, $options: 'i' } },
                    { 'nota.numero_nota': { $regex: busca, $options: 'i' } },
                    { 'nota.fornecedor.nome': { $regex: busca, $options: 'i' } },
                    { 'nota.fornecedor.razao_social': { $regex: busca, $options: 'i' } },
                    { 'nota.fornecedor.documento': { $regex: busca, $options: 'i' } },
                ]
            }

            total = await CobrancaModel.find(find).countDocuments();
            lista = await CobrancaModel.find(find)
                .skip(skip)
                .limit(limit)
                .sort({ data_vencimento: 1 })
                .lean();


            res.json({ lista, total })
        } catch (error) {
            errorHandler(error, res);
        }
    },
    criarContaReceber: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { data_emissao, data_vencimento, identificador, valor_total } = req.body;

            let cliente_id = req.body.cliente_id;
            let cliente = await PessoasModel.findOne({ _id: cliente_id, 'empresa._id': String(req.empresa._id) });
            if (!cliente) {
                throw new Error("Cliente não encontrado");
            }
            let conta = new CobrancaModel({
                data_emissao: dayjs(data_emissao).toDate(),
                data_vencimento: dayjs(data_vencimento).toDate(),
                identificador,
                origem: COBRANCA_ORIGEM.PENDENCIA_FINANCEIRA,
                status: COBRANCA_STATUS.PENDENTE,
                operacao: COBRANCA_OPERACAO.CREDITO,
                valor_bruto: 0,
                valor_juros: 0,
                valor_desconto: 0,
                valor_total,
                valor_pago: 0,
                valor_recebido: 0,
                parcela: 1,
                total_parcelas: 1,
                cliente,
                criado_por: {
                    usuario: req.usuario,
                    data_hora: dayjs().toDate()
                },
                empresa: req.empresa,
            });
            await conta.save();
            res.json(conta);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getContasReceber: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { perpage, page, status, formas_pagamento, data_inicial, data_final, tipo_data, ...query } = req.query;

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
                'operacao': COBRANCA_OPERACAO.CREDITO
            }
            console.log(find);

            // Filtro de busca (cliente, documento, venda)
            if (!!busca) {
                find.$or = [
                    { 'identificador': { $regex: busca, $options: 'i' } },
                    { 'venda.cliente.nome': { $regex: busca, $options: 'i' } },
                    { 'venda.cliente.razao_social': { $regex: busca, $options: 'i' } },
                    { 'venda.cliente.documento': { $regex: busca, $options: 'i' } },
                    { 'venda.codigo': { $regex: busca, $options: 'i' } }
                ]
            }

            // Filtro de status
            if (status && typeof status === 'string') {
                const statusArray = status.split(',').map(s => s.trim());
                if (statusArray.length > 0) {
                    find.status = { $in: statusArray };
                }
            }

            // Filtro de formas de pagamento
            if (formas_pagamento && typeof formas_pagamento === 'string') {
                const formasArray = formas_pagamento.split(',').map(f => f.trim());
                if (formasArray.length > 0) {
                    find['parcela_ref.forma_pagamento._id'] = { $in: formasArray };
                }
            }

            // Filtro de data
            if (data_inicial || data_final) {
                const campoData = tipo_data === 'emissao' ? 'data_emissao' : 'data_vencimento';

                if (data_inicial && data_final) {
                    // Ambas as datas fornecidas
                    find[campoData] = {
                        $gte: dayjs(data_inicial as string).startOf('day').toDate(),
                        $lte: dayjs(data_final as string).endOf('day').toDate()
                    };
                } else if (data_inicial) {
                    // Apenas data inicial
                    find[campoData] = {
                        $gte: dayjs(data_inicial as string).startOf('day').toDate()
                    };
                } else if (data_final) {
                    // Apenas data final
                    find[campoData] = {
                        $lte: dayjs(data_final as string).endOf('day').toDate()
                    };
                }
            }

            total = await CobrancaModel.find(find).countDocuments();
            lista = await CobrancaModel.find(find)
                .skip(skip)
                .limit(limit)
                .sort({ data_vencimento: 1 })
                .lean();

            res.json({ lista, total })
        } catch (error) {
            errorHandler(error, res);
        }
    },
    pagarContaPagar: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { id } = req.params;
            let { valor_pago, caixa_id, forma_pagamento_id, data_pagamento } = req.body;

            let _cobranca = await CobrancaModel.findOne({ 'empresa._id': req.empresa._id, _id: id });
            if (!_cobranca) {
                throw new Error("Cobrança não encontrada");
            }
            // Data de pagamento só não pode ser maior que hoje
            let today = dayjs().add(-3, 'h').startOf('day');
            if (data_pagamento && dayjs(data_pagamento).isAfter(today)) {
                throw new Error("A data de pagamento não pode ser maior que hoje.");
            }
            if (_cobranca?.status !== COBRANCA_STATUS.PENDENTE) {
                throw new Error("Apenas cobranças com status PENDENTE podem ser pagas.");
            }
            if (valor_pago <= 0) {
                throw new Error("O valor pago deve ser maior que zero.");
            }
            let valor_restante = (_cobranca?.valor_total || 0) - (_cobranca?.valor_pago || 0);
            if (valor_pago > valor_restante) {
                throw new Error("O valor recebido não pode ser maior que o valor restante da cobrança.");
            }

            let fp = await FormasPagamentoModel.findOne({ 'empresa._id': req.empresa._id, _id: forma_pagamento_id });
            if (!fp) {
                throw new Error("Forma de pagamento não encontrada");
            }
            let caixa = await CaixaModel.findOne({ 'empresa._id': req.empresa._id, _id: caixa_id });

            let pago_integralmente = false;
            if (valor_pago + (_cobranca?.valor_pago || 0) >= (_cobranca?.valor_total || 0)) {
                pago_integralmente = true;
            }
            let updates = {
                $inc: {
                    valor_pago: valor_pago,
                },
                $push: {
                    lancamentos: {
                        descricao: 'Recebimento de conta a receber',
                        data_pagamento: data_pagamento ? dayjs(data_pagamento).toDate() : dayjs().add(-3, 'h').startOf('day').toDate(),
                        forma_pagamento: fp.nome,
                        valor: valor_pago,
                        caixa: caixa,
                        pago_por: {
                            data_hora: dayjs().toDate(),
                            usuario: req.usuario
                        }
                    }
                }
            }
            if (pago_integralmente) {
                Object.assign(updates, {
                    $set: {
                        status: COBRANCA_STATUS.PAGA,
                        data_liquidacao: data_pagamento ? dayjs(data_pagamento).toDate() : dayjs().add(-3, 'h').startOf('day').toDate(),
                    }
                });
            }
            await CobrancaModel.updateOne({ _id: _cobranca._id }, updates);
            if (!!_cobranca?.nota?._id) {
                await inserirLancamentoFinanceiro({
                    tipo_lancamento: "PAGAMENTO_FORNECEDOR",
                    data_pagamento: data_pagamento ? dayjs(data_pagamento).toDate() : dayjs().add(-3, 'h').startOf('day').toDate(),
                    nota: _cobranca.nota,
                    empresa: req.empresa,
                    usuario: req.usuario,
                    valor: valor_pago,
                }, req.usuario, caixa?._id.toString())
            } else {
                await inserirLancamentoFinanceiro({
                    tipo_lancamento: "PAGAMENTO",
                    data_pagamento: data_pagamento ? dayjs(data_pagamento).toDate() : dayjs().add(-3, 'h').startOf('day').toDate(),
                    empresa: req.empresa,
                    usuario: req.usuario,
                    valor: valor_pago,
                }, req.usuario, caixa?._id.toString())
            }
            res.json(true);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    alterarContaPagar: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { id } = req.params;
            let _cobranca = await CobrancaModel.findOne({ 'empresa._id': req.empresa._id, _id: id });
            if (!_cobranca) {
                throw new Error("Cobrança não encontrada");
            }
            if (_cobranca?.status !== COBRANCA_STATUS.PENDENTE) {
                throw new Error("Apenas cobranças com status PENDENTE podem ser alteradas.");
            }
            let { valor_juros, valor_desconto } = req.body;
            let valor_total_cobranca = _cobranca?.valor_bruto || 0;
            if (valor_juros) {
                valor_total_cobranca += Number(valor_juros);
            }
            if (valor_desconto) {
                valor_total_cobranca -= Number(valor_desconto);
            }
            if (valor_total_cobranca < 0 || valor_total_cobranca < (_cobranca?.valor_pago || 0)) {
                throw new Error("O valor total da cobrança não pode ser menor que zero ou menor que o valor já recebido.");
            }
            _cobranca.valor_juros = valor_juros || 0;
            _cobranca.valor_desconto = valor_desconto || 0;
            _cobranca.valor_total = valor_total_cobranca;
            await _cobranca.save();
            res.json(_cobranca);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    estornarLancamentoContaPagar: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { id, id_lancamento } = req.params
            console.log("Estornando lançamento de conta pagar", id, id_lancamento);
            let _id = mongoose.Types.ObjectId.createFromHexString(id);
            let lancamento_id = mongoose.Types.ObjectId.createFromHexString(id_lancamento);
            let [lancamento] = await CobrancaModel.aggregate([
                { $match: { 'empresa._id': String(req.empresa._id), _id } },
                { $unwind: '$lancamentos' },
                { $match: { 'lancamentos._id': lancamento_id } }]
            )
            if (!lancamento) throw new Error("Lançamento não encontrado!");
            if (lancamento?.estornado) throw new Error("Lançamento já estornado!");
            await CobrancaModel.updateOne(
                { _id: lancamento._id, 'lancamentos._id': lancamento.lancamentos._id },
                {
                    $set: {
                        'lancamentos.$.estornado': true,
                        'lancamentos.$.estornado_por': {
                            data_hora: dayjs().toDate(),
                            usuario: req.usuario
                        }
                    },
                    $inc: {
                        valor_pago: -lancamento.lancamentos.valor
                    }
                }
            );
            // Se a cobrança estava PAGA, precisamos alterar para PENDENTE
            let cobranca_atualizada = await CobrancaModel.findOne({ _id: lancamento._id });
            if (cobranca_atualizada) {
                if (cobranca_atualizada.status === COBRANCA_STATUS.PAGA) {
                    cobranca_atualizada.status = COBRANCA_STATUS.PENDENTE;
                    cobranca_atualizada.data_liquidacao = null;
                    await cobranca_atualizada.save();
                }
            }
            if (!!cobranca_atualizada?.nota?._id) {
                await inserirLancamentoFinanceiro({
                    tipo_lancamento: "ESTORNO_PAGAMENTO_FORNECEDOR",
                    data_pagamento: lancamento.lancamentos.data_pagamento,
                    nota: cobranca_atualizada?.nota,
                    valor: lancamento.lancamentos.valor,
                    empresa: req.empresa,
                }, req.usuario, lancamento.lancamentos.caixa?._id)
            } else {
                await inserirLancamentoFinanceiro({
                    tipo_lancamento: "ESTORNO_PAGAMENTO",
                    data_pagamento: lancamento.lancamentos.data_pagamento,
                    valor: lancamento.lancamentos.valor,
                    empresa: req.empresa,
                }, req.usuario, lancamento.lancamentos.caixa?._id)
            }
            res.json(true);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    darBaixaContaPagar: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { id } = req.params;
            let _cobranca = await CobrancaModel.findOne({ 'empresa._id': req.empresa._id, _id: id });
            if (!_cobranca) {
                throw new Error("Cobrança não encontrada");
            }
            if (_cobranca?.status !== COBRANCA_STATUS.PENDENTE) {
                throw new Error("Apenas cobranças com status PENDENTE podem ser baixadas.");
            }
            // Marca a cobrança como BAIXADA
            _cobranca.status = COBRANCA_STATUS.BAIXADA;
            _cobranca.data_baixa = dayjs().add(-3, 'h').startOf('day').toDate();
            _cobranca.baixado_por = {
                data_hora: dayjs().toDate(),
                usuario: req.usuario
            };
            await _cobranca.save();
            res.json(_cobranca);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    reverterBaixaContaPagar: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { id } = req.params;
            let _cobranca = await CobrancaModel.findOne({ 'empresa._id': req.empresa._id, _id: id });
            if (!_cobranca) {
                throw new Error("Cobrança não encontrada");
            }
            if (_cobranca?.status !== COBRANCA_STATUS.BAIXADA) {
                throw new Error("Apenas cobranças com status BAIXADA podem ter a baixa revertida.");
            }
            // Reverte a cobrança para PENDENTE
            await CobrancaModel.updateOne(
                {
                    _id: _cobranca._id
                },
                {
                    $set: {
                        status: COBRANCA_STATUS.PENDENTE
                    },
                    $unset: {
                        data_baixa: "",
                        baixado_por: ""
                    }
                }
            )
            res.json({ success: true });
        } catch (error) {
            errorHandler(error, res);
        }
    },
    estornarLancamentoContaReceber: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { id, id_lancamento } = req.params
            console.log("Estornando lançamento de conta receber", id, id_lancamento);
            let _id = mongoose.Types.ObjectId.createFromHexString(id);
            let lancamento_id = mongoose.Types.ObjectId.createFromHexString(id_lancamento);
            console.log(id, id_lancamento);
            let [lancamento] = await CobrancaModel.aggregate([
                { $match: { 'empresa._id': String(req.empresa._id), _id } },
                { $unwind: '$lancamentos' },
                { $match: { 'lancamentos._id': lancamento_id } }]
            )
            if (!lancamento) throw new Error("Lançamento não encontrado!");
            if (lancamento?.estornado) throw new Error("Lançamento já estornado!");
            await CobrancaModel.updateOne(
                { _id: lancamento._id, 'lancamentos._id': lancamento.lancamentos._id },
                {
                    $set: {
                        'lancamentos.$.estornado': true,
                        'lancamentos.$.estornado_por': {
                            data_hora: dayjs().toDate(),
                            usuario: req.usuario
                        }
                    },
                    $inc: {
                        valor_recebido: -lancamento.lancamentos.valor
                    }
                }
            );
            // Se a cobrança estava PAGA, precisamos alterar para PENDENTE
            let cobranca_atualizada = await CobrancaModel.findOne({ _id: lancamento._id });
            if (cobranca_atualizada) {
                if (cobranca_atualizada.status === COBRANCA_STATUS.PAGA) {
                    cobranca_atualizada.status = COBRANCA_STATUS.PENDENTE;
                    cobranca_atualizada.data_liquidacao = null;
                    await cobranca_atualizada.save();
                }
            }
            await inserirLancamentoFinanceiro({
                tipo_lancamento: "ESTORNO_RECEBIMENTO_VENDA",
                data_recebimento: dayjs().add(-3, 'h').startOf('day').toDate(),
                venda: cobranca_atualizada?.venda,
                valor: lancamento.lancamentos.valor,
                empresa: req.empresa,
            }, req.usuario, lancamento.lancamentos.caixa?._id)
            res.json(true);
        } catch (error) {
            errorHandler(error, res);
        }
    },

    darBaixaContaReceber: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { id } = req.params;
            let _cobranca = await CobrancaModel.findOne({ 'empresa._id': req.empresa._id, _id: id });
            if (!_cobranca) {
                throw new Error("Cobrança não encontrada");
            }
            if (_cobranca?.status !== COBRANCA_STATUS.PENDENTE) {
                throw new Error("Apenas cobranças com status PENDENTE podem ser baixadas.");
            }
            // Marca a cobrança como BAIXADA
            _cobranca.status = COBRANCA_STATUS.BAIXADA;
            _cobranca.data_baixa = dayjs().add(-3, 'h').startOf('day').toDate();
            _cobranca.baixado_por = {
                data_hora: dayjs().toDate(),
                usuario: req.usuario
            };
            await _cobranca.save();
            res.json(_cobranca);
        } catch (error) {
            errorHandler(error, res);
        }
    },

    reverterBaixaContaReceber: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { id } = req.params;
            let _cobranca = await CobrancaModel.findOne({ 'empresa._id': req.empresa._id, _id: id });
            if (!_cobranca) {
                throw new Error("Cobrança não encontrada");
            }
            if (_cobranca?.status !== COBRANCA_STATUS.BAIXADA) {
                throw new Error("Apenas cobranças com status BAIXADA podem ter a baixa revertida.");
            }
            // Reverte a cobrança para PENDENTE
            await CobrancaModel.updateOne(
                {
                    _id: _cobranca._id
                },
                {
                    $set: {
                        status: COBRANCA_STATUS.PENDENTE
                    },
                    $unset: {
                        data_baixa: "",
                        baixado_por: ""
                    }
                }
            )
            res.json({ success: true });
        } catch (error) {
            errorHandler(error, res);
        }
    },
    pagarContaReceber: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { id } = req.params;
            let { valor_recebido, caixa_id, forma_pagamento_id, data_recebimento } = req.body;
            if (!!req.body?.valor) valor_recebido = req.body.valor;
            // Data de recebimento só não pode ser maior que hoje
            let today = dayjs().add(-3, 'h').startOf('day');
            if (data_recebimento && dayjs(data_recebimento).isAfter(today)) {
                throw new Error("A data de recebimento não pode ser maior que hoje.");
            }
            let _cobranca = await CobrancaModel.findOne({ 'empresa._id': req.empresa._id, _id: id });
            if (!_cobranca) {
                throw new Error("Cobrança não encontrada");
            }
            if (_cobranca?.status !== COBRANCA_STATUS.PENDENTE) {
                throw new Error("Apenas cobranças com status PENDENTE podem ser recebidas.");
            }
            if (valor_recebido <= 0) {
                throw new Error("O valor recebido deve ser maior que zero.");
            }
            let valor_restante = (_cobranca?.valor_total || 0) - (_cobranca?.valor_recebido || 0);
            if (valor_recebido > valor_restante) {
                throw new Error("O valor recebido não pode ser maior que o valor restante da cobrança.");
            }

            let fp = await FormasPagamentoModel.findOne({ 'empresa._id': req.empresa._id, _id: forma_pagamento_id });
            if (!fp) {
                throw new Error("Forma de pagamento não encontrada");
            }

            let caixa = null
            if (caixa_id) {
                caixa = await CaixaModel.findOne({ 'empresa._id': req.empresa._id, _id: caixa_id });
            } else {
                caixa = await CaixaModel.findOne({ 'empresa._id': req.empresa._id, principal: true });
            }

            let recebido_integralmente = false;
            if (valor_recebido + (_cobranca?.valor_recebido || 0) >= (_cobranca?.valor_total || 0)) {
                recebido_integralmente = true;
            }
            let updates = {
                $inc: {
                    valor_recebido: valor_recebido,
                },
                $push: {
                    lancamentos: {
                        descricao: 'Recebimento de conta a receber',
                        data_pagamento: data_recebimento ? dayjs(data_recebimento).toDate() : dayjs().add(-3, 'h').startOf('day').toDate(),
                        forma_pagamento: fp.nome,
                        valor: valor_recebido,
                        caixa: caixa,
                        recebido_por: {
                            data_hora: dayjs().toDate(),
                            usuario: req.usuario
                        }
                    }
                }
            }
            if (recebido_integralmente) {
                Object.assign(updates, {
                    $set: {
                        status: COBRANCA_STATUS.PAGA,
                        data_liquidacao: data_recebimento ? dayjs(data_recebimento).toDate() : dayjs().add(-3, 'h').startOf('day').toDate(),
                    }
                });
            }
            await CobrancaModel.updateOne({ _id: _cobranca._id }, updates);
            if (!!_cobranca?.venda?._id) {
                await inserirLancamentoFinanceiro({
                    tipo_lancamento: "RECEBIMENTO_VENDA",
                    data_recebimento: data_recebimento ? dayjs(data_recebimento).toDate() : dayjs().add(-3, 'h').startOf('day').toDate(),
                    venda: _cobranca.venda,
                    empresa: req.empresa,
                    usuario: req.usuario,
                    valor: valor_recebido,
                }, req.usuario, caixa?._id.toString())
            } else {
                await inserirLancamentoFinanceiro({
                    tipo_lancamento: "RECEBIMENTO",
                    data_recebimento: data_recebimento ? dayjs(data_recebimento).toDate() : dayjs().add(-3, 'h').startOf('day').toDate(),
                    empresa: req.empresa,
                    usuario: req.usuario,
                    valor: valor_recebido,
                }, req.usuario, caixa?._id.toString())
            }
            res.json(true);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    alterarContaReceber: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { id } = req.params;
            let _cobranca = await CobrancaModel.findOne({ 'empresa._id': req.empresa._id, _id: id });
            if (!_cobranca) {
                throw new Error("Cobrança não encontrada");
            }
            if (_cobranca?.status !== COBRANCA_STATUS.PENDENTE) {
                throw new Error("Apenas cobranças com status PENDENTE podem ser alteradas.");
            }
            let { valor_juros, valor_desconto } = req.body;
            let valor_total_cobranca = _cobranca?.valor_bruto || 0;
            if (valor_juros) {
                valor_total_cobranca += Number(valor_juros);
            }
            if (valor_desconto) {
                valor_total_cobranca -= Number(valor_desconto);
            }
            if (valor_total_cobranca < 0 || valor_total_cobranca < (_cobranca?.valor_recebido || 0)) {
                throw new Error("O valor total da cobrança não pode ser menor que zero ou menor que o valor já recebido.");
            }
            _cobranca.valor_juros = valor_juros || 0;
            _cobranca.valor_desconto = valor_desconto || 0;
            _cobranca.valor_total = valor_total_cobranca;
            await _cobranca.save();
            res.json(_cobranca);
        } catch (error) {
            errorHandler(error, res);
        }
    },
}



export async function inserirLancamentoFinanceiro(dados: any, usuario: any, caixa_id: string = '') {
    try {
        let _caixa = null;
        if (!caixa_id) {
            _caixa = await CaixaModel.findOne({ empresa: dados.empresa, principal: true }).lean();
        } else {
            _caixa = await CaixaModel.findById(caixa_id).lean();
        }
        // ENTRADAS
        if (dados.tipo_lancamento == "VENDA_AVISTA" && _caixa) {
            let _doc = new CaixaMovimentoModel({
                data: dayjs(dados.venda.data).toDate(),
                caixa: _caixa,
                venda: dados.venda,
                descricao: CAIXA_TIPO_DESCRICAO_OPERACAO.CREDITO.VENDA_RECEBIMENTO,
                tipo_operacao: CAIXA_TIPO_OPERACAO.CREDITO,
                valor: dados.valor,
                saldo_antes: _caixa.saldo,
                saldo_depois: _caixa.saldo + dados.valor,
                criado_por: {
                    data_hora: dayjs().toDate(),
                    usuario: usuario
                },
                empresa: _caixa.empresa
            })
            await _doc.save();
            await CaixaModel.updateOne(
                { _id: _caixa._id },
                {
                    $inc: {
                        saldo: dados.valor
                    }
                }
            )
            logDev("[LANCAMENTO CAIXA] - Lancamento de VENDA A VISTA inserido no caixa com sucesso.");
        }
        if (dados.tipo_lancamento == "RECEBIMENTO" && _caixa) {
            let _doc = new CaixaMovimentoModel({
                caixa: _caixa,
                data: dados.data_recebimento,
                descricao: CAIXA_TIPO_DESCRICAO_OPERACAO.CREDITO.RECEBIMENTO,
                tipo_operacao: CAIXA_TIPO_OPERACAO.CREDITO,
                valor: dados.valor,
                saldo_antes: _caixa.saldo,
                saldo_depois: _caixa.saldo + dados.valor,
                criado_por: {
                    data_hora: dayjs().toDate(),
                    usuario: usuario
                },
                empresa: _caixa.empresa
            })
            await _doc.save();
            await CaixaModel.updateOne(
                { _id: _caixa._id },
                {
                    $inc: {
                        saldo: dados.valor
                    }
                }
            )
            logDev("[LANCAMENTO CAIXA] - Lancamento de VENDA A PRAZO inserido no caixa com sucesso.");
        }
        if (dados.tipo_lancamento == "RECEBIMENTO_VENDA" && _caixa) {
            let _doc = new CaixaMovimentoModel({
                caixa: _caixa,
                data: dados.data_recebimento,
                venda: dados.venda,
                descricao: CAIXA_TIPO_DESCRICAO_OPERACAO.CREDITO.VENDA_RECEBIMENTO,
                tipo_operacao: CAIXA_TIPO_OPERACAO.CREDITO,
                valor: dados.valor,
                saldo_antes: _caixa.saldo,
                saldo_depois: _caixa.saldo + dados.valor,
                criado_por: {
                    data_hora: dayjs().toDate(),
                    usuario: usuario
                },
                empresa: _caixa.empresa
            })
            await _doc.save();
            await CaixaModel.updateOne(
                { _id: _caixa._id },
                {
                    $inc: {
                        saldo: dados.valor
                    }
                }
            )
            logDev("[LANCAMENTO CAIXA] - Lancamento de VENDA A PRAZO inserido no caixa com sucesso.");
        }
        if (dados.tipo_lancamento == "ESTORNO_RECEBIMENTO_VENDA" && _caixa) {
            let valor = dados.valor * -1;
            let _doc = new CaixaMovimentoModel({
                caixa: _caixa,
                data: dados.data_recebimento,
                venda: dados.venda,
                descricao: CAIXA_TIPO_DESCRICAO_OPERACAO.DEBITO.ESTORNO_RECEBIMENTO_VENDA,
                tipo_operacao: CAIXA_TIPO_OPERACAO.DEBITO,
                valor: valor,
                saldo_antes: _caixa.saldo,
                saldo_depois: _caixa.saldo + valor,
                criado_por: {
                    data_hora: dayjs().toDate(),
                    usuario: usuario
                },
                empresa: _caixa.empresa
            })
            await _doc.save();
            await CaixaModel.updateOne(
                { _id: _caixa._id },
                {
                    $inc: {
                        saldo: valor
                    }
                }
            )
            logDev("[LANCAMENTO CAIXA] - Lancamento de ESTORNO RECEBIMENTO DE VENDA inserido no caixa com sucesso.");
        }


        // SAÍDAS
        if (dados.tipo_lancamento == "PAGAMENTO_FORNECEDOR" && _caixa) {
            let _doc = new CaixaMovimentoModel({
                caixa: _caixa,
                data: dados.data_pagamento,
                nota: dados.nota,
                descricao: CAIXA_TIPO_DESCRICAO_OPERACAO.DEBITO.PAGAMENTO_FORNECEDOR,
                tipo_operacao: CAIXA_TIPO_OPERACAO.DEBITO,
                valor: dados.valor * -1,
                saldo_antes: _caixa.saldo,
                saldo_depois: _caixa.saldo - dados.valor,
                criado_por: {
                    data_hora: dayjs().toDate(),
                    usuario: usuario
                },
                empresa: _caixa.empresa
            })
            await _doc.save();
            await CaixaModel.updateOne(
                { _id: _caixa._id },
                {
                    $inc: {
                        saldo: dados.valor * -1
                    }
                }
            )
            logDev("[LANCAMENTO CAIXA] - Lancamento de PAGAMENTO FORNECEDOR inserido no caixa com sucesso.");
        }
        if (dados.tipo_lancamento == "PAGAMENTO" && _caixa) {
            let _doc = new CaixaMovimentoModel({
                caixa: _caixa,
                data: dados.data_pagamento,
                descricao: CAIXA_TIPO_DESCRICAO_OPERACAO.DEBITO.PAGAMENTO,
                tipo_operacao: CAIXA_TIPO_OPERACAO.DEBITO,
                valor: dados.valor * -1,
                saldo_antes: _caixa.saldo,
                saldo_depois: _caixa.saldo - dados.valor,
                criado_por: {
                    data_hora: dayjs().toDate(),
                    usuario: usuario
                },
                empresa: _caixa.empresa
            })
            await _doc.save();
            await CaixaModel.updateOne(
                { _id: _caixa._id },
                {
                    $inc: {
                        saldo: dados.valor * -1
                    }
                }
            )
            logDev("[LANCAMENTO CAIXA] - Lancamento de PAGAMENTO inserido no caixa com sucesso.");
        }
        if (dados.tipo_lancamento == "ESTORNO_PAGAMENTO_FORNECEDOR" && _caixa) {
            let _doc = new CaixaMovimentoModel({
                caixa: _caixa,
                data: dados.data_pagamento,
                nota: dados.nota,
                descricao: CAIXA_TIPO_DESCRICAO_OPERACAO.CREDITO.ESTORNO_PAGAMENTO_FORNECEDOR,
                tipo_operacao: CAIXA_TIPO_OPERACAO.CREDITO,
                valor: dados.valor,
                saldo_antes: _caixa.saldo,
                saldo_depois: _caixa.saldo + dados.valor,
                criado_por: {
                    data_hora: dayjs().toDate(),
                    usuario: usuario
                },
                empresa: _caixa.empresa
            })
            await _doc.save();
            await CaixaModel.updateOne(
                { _id: _caixa._id },
                {
                    $inc: {
                        saldo: dados.valor
                    }
                }
            )
            logDev("[LANCAMENTO CAIXA] - Lancamento de PAGAMENTO inserido no caixa com sucesso.");
        }
        if (dados.tipo_lancamento == "ESTORNO_PAGAMENTO" && _caixa) {
            let _doc = new CaixaMovimentoModel({
                caixa: _caixa,
                data: dados.data_pagamento,
                descricao: CAIXA_TIPO_DESCRICAO_OPERACAO.CREDITO.ESTORNO_PAGAMENTO,
                tipo_operacao: CAIXA_TIPO_OPERACAO.CREDITO,
                valor: dados.valor,
                saldo_antes: _caixa.saldo,
                saldo_depois: _caixa.saldo + dados.valor,
                criado_por: {
                    data_hora: dayjs().toDate(),
                    usuario: usuario
                },
                empresa: _caixa.empresa
            })
            await _doc.save();
            await CaixaModel.updateOne(
                { _id: _caixa._id },
                {
                    $inc: {
                        saldo: dados.valor
                    }
                }
            )
            logDev("[LANCAMENTO CAIXA] - Lancamento de ESTORNO PAGAMENTO inserido no caixa com sucesso.");
        }
    } catch (error) {
        console.log("Erro ao inserir lancamento financeiro no caixa: ", error);
    }
}
