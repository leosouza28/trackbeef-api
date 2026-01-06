import dayjs from "dayjs";
import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { AlmoxarifadoModel } from "../models/almoxarifado.model";
import { COBRANCA_OPERACAO, COBRANCA_ORIGEM, COBRANCA_STATUS, CobrancaModel } from "../models/cobrancas.model";
import { EmpresaModel } from "../models/empresa.model";
import { EntradasNotasModel, NOTA_SITUACAO } from "../models/entradas-notas.model";
import { FormasPagamentoModel } from "../models/formas-pagamento.model";
import { PessoasModel } from "../models/pessoas.model";
import { PRODUTO_ESTOQUE_ORIGEM_MOVIMENTO, PRODUTO_ESTOQUE_TIPO_MOVIMENTO, ProdutosEstoqueMov } from "../models/produtos-estoque-mov.model";
import { ProdutosEstoqueModel } from "../models/produtos-estoque.model";
import { PRODUTOS_PECAS_STATUS_ESTOQUE, ProdutosPecasModel } from "../models/produtos-pecas.model";
import { PRODUTO_TIPO_SAIDA, ProdutosModel } from "../models/produtos.model";
import { errorHandler, logDev } from "../util";

export default {
    getEmpresaData: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { id } = req.params;
            let empresa = await EmpresaModel.findOne({ _id: id });
            if (!empresa) {
                throw new Error("Empresa não encontrada");
            }
            res.json(empresa)
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getEmpresaByCodigoAtivacao: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let empresa = await EmpresaModel.findOne({ codigo_acesso: req.params.id });
            if (!empresa) {
                throw new Error("Código de ativação inválido");
            }
            res.json(empresa);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getProdutos: async (req: Request, res: Response, next: NextFunction) => {
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
                    { nome: { $regex: busca, $options: 'i' } },
                ]
            }

            total = await ProdutosModel.find(find).countDocuments();
            lista = await ProdutosModel.find(find)
                .skip(skip)
                .limit(limit)
                .sort({ prioridade: -1, _id: -1 })
                .lean();

            res.json({ lista, total })

        } catch (error) {
            errorHandler(error, res);
        }
    },
    getProdutoById: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let produto = await ProdutosModel.findOne({
                'empresa._id': req.empresa._id,
                _id: req.params.id
            });
            if (!produto) {
                throw new Error("Produto não encontrado");
            }
            res.json(produto);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    postProduto: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let payload: any = {
                sku: req.body.sku,
                nome: req.body.nome,
                sigla: req.body.sigla,
                categoria: req.body.categoria,
                unidade: req.body.unidade,
                status: req.body.status,
                calcula_rendimento_entrada_nota: req.body.calcula_rendimento_entrada_nota,
                tipo_saida: req.body?.tipo_saida || PRODUTO_TIPO_SAIDA.ESTOQUE_PADRAO,
                custo_medio: req.body.custo_medio,
                preco_custo: req.body.preco_custo,
                preco_venda: req.body.preco_venda,
            }
            let doc = null;
            if (!!req.body?._id) {
                // Verifica se tem lançamentos de peças vinculados a esse produto
                let _pecas = await ProdutosPecasModel.findOne({ 'empresa._id': req.empresa._id, 'produto._id': req.body._id });
                if (_pecas && payload.tipo_saida !== PRODUTO_TIPO_SAIDA.ESTOQUE_PECA) {
                    throw new Error("Não é possível alterar o tipo de saída deste produto, pois existem peças vinculadas a ele.");
                }
                doc = await ProdutosModel.findOneAndUpdate({
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
                // Alterar o produto no estoque também
                await ProdutosEstoqueModel.updateMany({
                    'empresa._id': req.empresa._id,
                    'produto._id': doc._id
                }, {
                    $set: {
                        produto: doc
                    }
                })
            } else {
                payload.empresa = req.empresa;
                payload.criado_por = {
                    data_hora: dayjs().toDate(),
                    usuario: req.usuario
                }
                doc = new ProdutosModel(payload);
                await doc.save()
            }
            res.json(doc)
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getEntradaNotas: async (req: Request, res: Response, next: NextFunction) => {
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
                    { 'fornecedor.nome': { $regex: busca, $options: 'i' } },
                ]
            }

            lista = await EntradasNotasModel.find(find)
                .skip(skip)
                .limit(limit)
                .sort({ _id: -1 })
                .lean();

            total = await EntradasNotasModel.find(find).countDocuments();

            res.json({ lista, total })
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getEntradaNotaById: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let nota = await EntradasNotasModel.findOne({
                'empresa._id': req.empresa._id,
                _id: req.params.id
            });
            if (!nota) {
                throw new Error("Entrada de nota não encontrada");
            }
            res.json(nota);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    deleteNotaEntradaById: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let nota = await EntradasNotasModel.findOne({ 'empresa._id': req.empresa._id, _id: req.params.id });
            if (!nota) {
                throw new Error("Entrada de nota não encontrada");
            }
            if (nota?.efetuar_fechamento) {
                throw new Error("Não é possível deletar uma entrada de nota que já foi fechada no estoque");
            }
            await EntradasNotasModel.deleteOne({ _id: nota._id });
            res.json({ message: "Entrada de nota deletada com sucesso" });
        } catch (error) {
            errorHandler(error, res);
        }
    },
    cancelarFechamentoNota: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let nota = await EntradasNotasModel.findOne({ 'empresa._id': req.empresa._id, _id: req.params.id });
            if (!nota) {
                throw new Error("Entrada de nota não encontrada");
            }
            if (nota?.situacao == NOTA_SITUACAO.CANCELADA) {
                throw new Error("A entrada de nota já está com o fechamento cancelado");
            }
            if (nota?.situacao == NOTA_SITUACAO.ABERTA) {
                throw new Error("A entrada de nota está aberta, não é possível cancelar o fechamento");
            }

            let produtos_db = await ProdutosModel.find({ 'empresa._id': req.empresa._id }).lean();
            let produtos_map: any = {};
            for (let p of produtos_db) produtos_map[p._id.toString()] = p;

            // 1. Cancelar cobranças se solicitado
            if (req.body.cancelarCobrancas) {
                await CobrancaModel.deleteMany({
                    origem: COBRANCA_ORIGEM.NOTA_ENTRADA,
                    identificador: { $regex: `^${nota.numero_nota}` }
                });
                logDev(`Cobranças canceladas para a nota ${nota.numero_nota}`);
            }


            // 2. Remover do estoque se solicitado
            if (req.body.removerEstoque) {
                let ops = [];

                for (let produto_nota of nota.produtos) {
                    // @ts-ignore
                    let _produto_db = produtos_map[produto_nota.produto_id];

                    if (!_produto_db) continue;

                    if (_produto_db?.tipo_saida === PRODUTO_TIPO_SAIDA.ESTOQUE_PECA) {
                        // Remover peças lançadas
                        await ProdutosPecasModel.deleteMany({
                            'empresa._id': req.empresa._id,
                            'produto._id': _produto_db._id,
                            'nota._id': nota._id
                        });

                        // Decrementar estoque
                        ops.push(
                            ProdutosEstoqueModel.updateOne(
                                {
                                    'empresa._id': req.empresa._id,
                                    'produto._id': _produto_db._id,
                                    'almoxarifado._id': nota.almoxarifado?._id,
                                },
                                {
                                    $inc: {
                                        // @ts-ignore
                                        saldo_estoque: -produto_nota.total_peso
                                    }
                                }
                            )
                        );
                        for (let pnota of produto_nota.lancamentos) {
                            ops.push(
                                // Registrar movimentação de saída (estorno)
                                ProdutosEstoqueMov.create({
                                    produto: _produto_db,
                                    almoxarifado: nota.almoxarifado,
                                    tipo_movimento: PRODUTO_ESTOQUE_TIPO_MOVIMENTO.SAIDA,
                                    origem_movimento: PRODUTO_ESTOQUE_ORIGEM_MOVIMENTO.CANCELAMENTO_NOTA_ENTRADA,
                                    // @ts-ignore
                                    quantidade: -pnota.peso,
                                    nota_entrada: {
                                        _id: nota._id,
                                        numero_nota: nota.numero_nota,
                                        data_nota: nota.data_nota
                                    },
                                    observacao: `Cancelamento de fechamento da nota ${nota.numero_nota} - Motivo: ${req.body.motivo}`,
                                    empresa: req.empresa
                                })
                            )
                        }

                    }

                    if (_produto_db?.tipo_saida === PRODUTO_TIPO_SAIDA.ESTOQUE_PADRAO) {
                        // Decrementar estoque
                        ops.push(
                            ProdutosEstoqueModel.updateOne(
                                {
                                    'empresa._id': req.empresa._id,
                                    'produto._id': _produto_db._id,
                                    'almoxarifado._id': nota.almoxarifado?._id,
                                },
                                {
                                    $inc: {
                                        // @ts-ignore
                                        saldo_estoque: -produto_nota.total_peso
                                    }
                                }
                            )
                        );
                        // Registrar movimentação de saída (estorno)
                        ops.push(
                            ProdutosEstoqueMov.create({
                                produto: _produto_db,
                                almoxarifado: nota.almoxarifado,
                                tipo_movimento: PRODUTO_ESTOQUE_TIPO_MOVIMENTO.SAIDA,
                                origem_movimento: PRODUTO_ESTOQUE_ORIGEM_MOVIMENTO.CANCELAMENTO_NOTA_ENTRADA,
                                // @ts-ignore
                                quantidade: -produto_nota.total_peso,
                                nota_entrada: {
                                    _id: nota._id,
                                    numero_nota: nota.numero_nota,
                                    data_nota: nota.data_nota
                                },
                                observacao: `Cancelamento de fechamento da nota ${nota.numero_nota} - Motivo: ${req.body.motivo}`,
                                empresa: req.empresa
                            })
                        );
                    }

                }

                await Promise.all(ops);
                logDev(`Estoque revertido para a nota ${nota.numero_nota}`);
            }

            // 3. Atualizar nota para cancelada
            nota.efetuar_fechamento = false;
            nota.situacao = NOTA_SITUACAO.CANCELADA;
            nota.cancelado_fechamento_motivo = req.body.motivo || '';
            nota.cancelado_fechamento = {
                data_hora: dayjs().toDate(),
                usuario: req.usuario
            }
            nota.atualizado_por = {
                data_hora: dayjs().toDate(),
                usuario: req.usuario
            }
            await nota.save();

            logDev(`Nota ${nota.numero_nota} cancelada com sucesso`);
            res.json(nota);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    postEntradaNota: async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.body?.data_nota) {
                throw new Error("Data da nota é obrigatória");
            }
            if (!req.body?.fornecedor) {
                throw new Error("Fornecedor é obrigatório");
            }
            if (!req.body?.numero_nota) {
                throw new Error("Número da nota é obrigatório");
            }

            let _fornecedor = await PessoasModel.findOne({ _id: req.body.fornecedor, 'empresa._id': req.empresa._id });
            if (!_fornecedor) {
                throw new Error("Fornecedor não encontrado");
            }

            let _almoxarifado = await AlmoxarifadoModel.findOne({ '_id': req.body.almoxarifado, 'empresa._id': req.empresa._id });
            if (!_almoxarifado) {
                throw new Error("É necessário cadastrar um almoxarifado antes de lançar uma nota de entrada.");
            }

            let payload: any = {
                data_nota: req.body.data_nota,
                fornecedor: _fornecedor,
                numero_nota: req.body.numero_nota,
                almoxarifado: _almoxarifado,
                qtd_animais: req.body?.qtd_animais || 0,
                peso_animais: req.body?.peso_animais || 0,
                valor_pago_animais: req.body?.valor_pago_animais || 0,
                valor_frete: req.body?.valor_frete || 0,
                valor_total_nota: req.body.valor_total_nota,
                produtos: req.body.produtos,
                cobrancas: req.body.cobrancas,
                efetuar_fechamento: req.body.efetuar_fechamento,
            }
            if (!payload?.efetuar_fechamento) {
                payload.situacao = NOTA_SITUACAO.ABERTA;
            } else {
                payload.situacao = NOTA_SITUACAO.FECHADA;
            }
            logDev(JSON.stringify(payload, null, 2));
            let doc = null;
            if (!!req.body?._id) {
                doc = await EntradasNotasModel.findOneAndUpdate({
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
                payload.empresa = req.empresa;
                payload.criado_por = {
                    data_hora: dayjs().toDate(),
                    usuario: req.usuario
                }
                doc = new EntradasNotasModel(payload);
                await doc.save();
            }
            if (payload.situacao == NOTA_SITUACAO.FECHADA) {
                // Additional logic for closed situation if needed
                await processarNotaSistema(doc, req.usuario, req.empresa, _almoxarifado._id.toString());
            }
            res.json(doc);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getAlmoxarifados: async (req: Request, res: Response, next: NextFunction) => {
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
                    { nome: { $regex: busca, $options: 'i' } },
                ]
            }
            let sort: any = { _id: -1 };
            if (query?.sort_by === 'principal') {
                sort = { principal: -1 };
            }

            total = await AlmoxarifadoModel.find(find).countDocuments();
            lista = await AlmoxarifadoModel.find(find)
                .skip(skip)
                .limit(limit)
                .sort(sort)
                .lean();

            await Promise.all(
                lista.map(async (item: any) => {
                    let [retorno] = await ProdutosEstoqueModel.aggregate([
                        {
                            $match: {
                                'empresa._id': String(req.empresa._id),
                                'almoxarifado._id': String(item._id)
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                total_estoque: {
                                    $sum: "$saldo_estoque"
                                },
                                valor_estoque: {
                                    $sum: {
                                        $multiply: ["$saldo_estoque", "$produto.custo_medio"]
                                    }
                                }
                            }
                        }
                    ]);
                    console.log(retorno);
                    if (retorno?.total_estoque) {
                        item.total_produtos_estoque = retorno.total_estoque.toFixed(2);
                        item.valor_estoque = retorno.valor_estoque.toFixed(2);
                    } else {
                        item.total_produtos_estoque = (0).toFixed(2);
                        item.valor_estoque = (0).toFixed(2);
                    }
                })
            );

            res.json({ lista, total })

        } catch (error) {
            errorHandler(error, res);
        }
    },
    getAlmoxarifadoById: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let almoxarifado = await AlmoxarifadoModel.findOne({
                'empresa._id': req.empresa._id,
                _id: req.params.id
            });
            if (!almoxarifado) throw new Error("Almoxarifado não encontrado");
            res.json(almoxarifado);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    postAlmoxarifado: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let payload: any = {
                nome: req.body.nome,
                principal: req.body.principal || false,
            }
            if (!!req.body?._id) {
                // Precisamos verificar se já tem algum almoxarifado principal
                if (req.body.principal) {
                    let almoxarifadoPrincipal = await AlmoxarifadoModel.findOne({
                        'empresa._id': req.empresa._id,
                        principal: true,
                        _id: { $ne: req.body._id }
                    });
                    if (almoxarifadoPrincipal) {
                        throw new Error("Já existe um almoxarifado principal definido.");
                    }
                }

                let almoxarifado = await AlmoxarifadoModel.findOne({
                    'empresa._id': req.empresa._id,
                    _id: req.body._id
                });
                if (!almoxarifado) throw new Error("Almoxarifado não encontrado");
                Object.assign(almoxarifado, payload);
                almoxarifado.atualizado_por = {
                    data_hora: dayjs().toDate(),
                    usuario: req.usuario
                }
                await almoxarifado.save();
                res.json(almoxarifado);
            } else {
                // Precisamos verificar se já tem algum almoxarifado principal
                if (req.body.principal) {
                    let almoxarifadoPrincipal = await AlmoxarifadoModel.findOne({
                        'empresa._id': req.empresa._id,
                        principal: true,
                    });
                    if (almoxarifadoPrincipal) {
                        throw new Error("Já existe um almoxarifado principal definido.");
                    }
                }
                payload.empresa = req.empresa;
                payload.criado_por = {
                    data_hora: dayjs().toDate(),
                    usuario: req.usuario
                }
                let almoxarifado = new AlmoxarifadoModel(payload);
                await almoxarifado.save();
                res.json(almoxarifado);
            }
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getEstoqueByAlmoxarifado: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { id } = req.params;

            let find = {
                'empresa._id': req.empresa._id,
                'almoxarifado._id': id,
            }

            let valor_total_estoque = 0;
            let total_itens_estoque = 0;

            let lista = await ProdutosEstoqueModel.find(find).lean();

            for (let item of lista) {
                // @ts-ignore
                valor_total_estoque += (item.saldo_estoque * item?.produto?.custo_medio || 0);
                total_itens_estoque += item.saldo_estoque;
            }
            let lista_pecas = await ProdutosPecasModel.find({
                'empresa._id': req.empresa._id,
                'almoxarifado._id': id,
                status_estoque: {
                    $in: [
                        PRODUTOS_PECAS_STATUS_ESTOQUE.EM_ESTOQUE,
                        PRODUTOS_PECAS_STATUS_ESTOQUE.RESERVADO
                    ]
                }
            }).lean();

            res.json({
                lista,
                lista_pecas,
                valor_total_estoque,
                total_itens_estoque
            })
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getEstoques: async (req: Request, res: Response, next: NextFunction) => {
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

            total = await ProdutosEstoqueModel.find(find).countDocuments();
            lista = await ProdutosEstoqueModel.find(find)
                .skip(skip)
                .limit(limit)
                .sort({ _id: -1 })
                .lean();

            res.json({ lista, total })
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getEstoqueByProdutoAlmoxarifado: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { idproduto, idalmoxarifado } = req.params;
            let find = {
                'empresa._id': req.empresa._id,
                'produto._id': idproduto,
            };
            if (idalmoxarifado) {
                Object.assign(find, { 'almoxarifado._id': idalmoxarifado });
            }
            let produto = await ProdutosModel.findOne({ 'empresa._id': req.empresa._id, _id: idproduto }).lean();
            let almoxarifado = null;
            if (idalmoxarifado) {
                almoxarifado = await AlmoxarifadoModel.findOne({ 'empresa._id': req.empresa._id, _id: idalmoxarifado }).lean();
            }
            let produto_estoque = await ProdutosEstoqueModel.findOne(find).lean();
            let historico = await ProdutosEstoqueMov.find(find).sort({ _id: -1 }).lean();
            let pecas = [];
            let pecas_estoque = await ProdutosPecasModel.find({
                'empresa._id': req.empresa._id,
                'produto._id': idproduto,
                'status_estoque': {
                    $in: [
                        PRODUTOS_PECAS_STATUS_ESTOQUE.EM_ESTOQUE,
                        PRODUTOS_PECAS_STATUS_ESTOQUE.RESERVADO
                    ]
                }
            }).lean();
            for (let p of pecas_estoque) {
                pecas.push(p);
            }
            res.json({ historico, pecas, produto, almoxarifado, produto_estoque });
        } catch (error) {
            errorHandler(error, res);
        }
    },
    addPecaAvulsa: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { produto, almoxarifado, data_lancamento, peso, preco_custo_unitario } = req.body;

            // Validações
            if (!produto || !almoxarifado || !data_lancamento || !peso || !preco_custo_unitario) {
                return res.status(400).json({ error: 'Campos obrigatórios faltando' });
            }
            // Buscar dados do produto
            const produtoDoc = await ProdutosModel.findOne({ _id: produto, 'empresa._id': req.empresa._id }).lean();
            if (!produtoDoc) throw new Error("Produto não encontrado!");
            // Buscar dados do almoxarifado
            const almoxarifadoDoc = await AlmoxarifadoModel.findOne({ _id: almoxarifado, 'empresa._id': req.empresa._id }).lean();
            if (!almoxarifadoDoc) throw new Error("Almoxarifado não encontrado!");

            // Buscar o estoque do produto neste almoxarifado
            const estoque = await ProdutosEstoqueModel.findOne({
                'produto._id': produto,
                'almoxarifado._id': almoxarifado,
                'empresa._id': req.empresa._id
            });
            if (!estoque) throw new Error("Estoque não encontrado pra esse produto!");

            // Criar a peça avulsa
            const pecaAvulsa = new ProdutosPecasModel({
                produto: produtoDoc,
                nota: {
                    _id: 'AVULSA',
                    numero_nota: 'AVULSA',
                    data_nota: new Date(data_lancamento),
                    fornecedor: {
                        _id: '',
                        nome: 'LANÇAMENTO AVULSO',
                        razao_social: 'LANÇAMENTO AVULSO',
                        documento: ''
                    }
                },
                unidade: produtoDoc.unidade,
                peso: peso,
                preco_custo_unitario: preco_custo_unitario,
                valor_custo: peso * preco_custo_unitario,
                valor_total: peso * preco_custo_unitario,
                almoxarifado: almoxarifadoDoc,
                status_estoque: PRODUTOS_PECAS_STATUS_ESTOQUE.EM_ESTOQUE,
                criado_por: {
                    data_hora: dayjs().toDate(),
                    usuario: req.usuario
                },
                empresa: req.empresa
            });
            await pecaAvulsa.save();
            // Atualizar o saldo do estoque
            estoque.saldo_estoque += peso;
            await estoque.save();

            // Criar movimentação de estoque
            const movimentacao = new ProdutosEstoqueMov({
                produto: produtoDoc,
                almoxarifado: almoxarifadoDoc,
                tipo_movimento: PRODUTO_ESTOQUE_TIPO_MOVIMENTO.ENTRADA,
                origem_movimento: PRODUTO_ESTOQUE_ORIGEM_MOVIMENTO.LANCAMENTO_AVULSO,
                quantidade: peso,
                saldo_anterior: estoque.saldo_estoque - peso,
                saldo_novo: estoque.saldo_estoque,
                data_hora: new Date(data_lancamento),
                criado_por: {
                    data_hora: new Date(),
                    usuario: req.usuario
                },
                empresa: req.empresa
            });
            await movimentacao.save();
            res.json(pecaAvulsa);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getFormasPagamento: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { perpage, page, origem, ...query } = req.query;
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
            if (origem) find.disponivel_em = origem;

            total = await FormasPagamentoModel.find(find).countDocuments();
            lista = await FormasPagamentoModel.find(find)
                .skip(skip)
                .limit(limit)
                .sort({ _id: -1 })
                .lean();

            res.json({ lista, total })

        } catch (error) {
            errorHandler(error, res);
        }
    },
    getFormaPagamentoById: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let formaPagamento = await FormasPagamentoModel.findOne({
                'empresa._id': req.empresa._id,
                _id: req.params.id
            });
            if (!formaPagamento) throw new Error("Forma de pagamento não encontrada");
            res.json(formaPagamento);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    postFormaPagamento: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let payload: any = {
                nome: req.body.nome,
                avista: req.body.avista || false,
                dias_intervalo: req.body.dias_intervalo || 1,
                disponivel_em: req.body.disponivel_em || [],
                status: req.body.status || 'ATIVO',
            }
            let doc = null;
            if (!!req.body?._id) {
                doc = await FormasPagamentoModel.findOneAndUpdate({
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
                payload.empresa = req.empresa;
                payload.criado_por = {
                    data_hora: dayjs().toDate(),
                    usuario: req.usuario
                }
                doc = new FormasPagamentoModel(payload);
                await doc.save()
            }
            res.json(doc)
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getConfiguracoesEmpresa: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let empresa = await EmpresaModel.findOne({ _id: req.empresa._id });
            res.json(empresa);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    postConfiguracoesEmpresa: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let empresa = await EmpresaModel.findOne({ _id: req.empresa._id });
            if (!empresa) throw new Error("Empresa não encontrada");
            await EmpresaModel.updateOne({ _id: empresa._id }, {
                $set: {
                    logo: req.body.logo || empresa.logo,
                    nome: req.body.nome || empresa.nome,
                    razao_social: req.body.razao_social || empresa.razao_social,
                    doc_type: req.body.doc_type || empresa.doc_type,
                    documento: req.body.documento || empresa.documento,
                    endereco: req.body.endereco || empresa.endereco,
                    telefones: req.body.telefones || empresa.telefones,
                    email: req.body.email || empresa.email,
                    juros: req.body.juros || empresa.juros,
                    multa: req.body.multa || empresa.multa,
                }
            });
            res.json({ message: "Configurações atualizadas com sucesso" });
        } catch (error) {
            errorHandler(error, res);
        }
    },


}

export async function processarNotaSistema(nota: any, usuario: any, empresa: any, almoxarifadoId: string) {
    try {
        let almoxarifado = await AlmoxarifadoModel.findOne({ '_id': almoxarifadoId, 'empresa._id': empresa._id }).lean();
        if (!almoxarifado) throw new Error("É necessário informar um almoxarifado para processar a nota de entrada.");

        let produtos_db = await ProdutosModel.find({ 'empresa._id': empresa._id }).lean();
        let produtos_map: any = {};
        for (let p of produtos_db) produtos_map[p._id.toString()] = p;
        let inserts = [];
        let ops = [];
        let inserts_movs_estoque = []

        for (let produto_nota of nota.produtos) {
            // Aqui vai rodar as validações
            let _produto_db = produtos_map[produto_nota.produto_id];
            if (!_produto_db?.tipo_saida) {
                throw new Error(`Produto ${_produto_db.nome} não possui tipo de saída definido.`);
            }
            // Verifica se tem algum 'lancamento.peso' menor ou igual a zero
            for (let lancamento of produto_nota.lancamentos) {
                if (lancamento.peso <= 0) {
                    throw new Error(`Produto ${_produto_db.nome} possui lançamento com peso menor ou igual a zero.`);
                }
            }
        }
        for (let produto_nota of nota.produtos) {
            let _produto_db = produtos_map[produto_nota.produto_id];

            if (_produto_db?.tipo_saida === PRODUTO_TIPO_SAIDA.ESTOQUE_PECA) {
                for (let lancamento of produto_nota.lancamentos) {
                    let payload: any = {
                        produto: _produto_db,
                        nota,
                        unidade: _produto_db.unidade,
                        peso: lancamento.peso,
                        preco_custo_unitario: lancamento.preco_custo_unitario,
                        valor_custo: lancamento.peso * lancamento.preco_custo_unitario,
                        valor_total: lancamento.valor_total,
                        almoxarifado: almoxarifado,
                        status_estoque: PRODUTOS_PECAS_STATUS_ESTOQUE.EM_ESTOQUE,
                        criado_por: {
                            data_hora: dayjs().toDate(),
                            usuario: usuario
                        },
                        empresa: empresa
                    }
                    inserts.push(payload);
                    inserts_movs_estoque.push(
                        {
                            produto: _produto_db,
                            almoxarifado: almoxarifado,
                            tipo_movimento: PRODUTO_ESTOQUE_TIPO_MOVIMENTO.ENTRADA,
                            origem_movimento: PRODUTO_ESTOQUE_ORIGEM_MOVIMENTO.NOTA_ENTRADA,
                            quantidade: lancamento.peso,
                            quantidade_unitaria: 1,
                            nota_entrada: {
                                _id: nota._id,
                                numero_nota: nota.numero_nota,
                                data_nota: nota.data_nota
                            },
                            empresa: empresa
                        }
                    )
                }
                ops.push(
                    ProdutosEstoqueModel.updateOne(
                        {
                            'empresa._id': empresa._id,
                            'produto._id': _produto_db._id,
                            'almoxarifado._id': almoxarifado._id,
                        },
                        {
                            $set: {
                                produto: _produto_db,
                                almoxarifado: almoxarifado,
                                empresa: empresa
                            },
                            $inc: {
                                saldo_estoque: produto_nota.total_peso
                            }
                        },
                        { upsert: true }
                    )
                )
            }
            if (_produto_db?.tipo_saida === PRODUTO_TIPO_SAIDA.ESTOQUE_PADRAO) {
                ops.push(
                    ProdutosEstoqueModel.updateOne(
                        {
                            'empresa._id': empresa._id,
                            'produto._id': _produto_db._id,
                            'almoxarifado._id': almoxarifado._id,
                        },
                        {
                            $set: {
                                produto: _produto_db,
                                almoxarifado: almoxarifado,
                                empresa: empresa
                            },
                            $inc: {
                                saldo_estoque: produto_nota.total_peso
                            }
                        },
                        { upsert: true }
                    )
                )
                inserts_movs_estoque.push(
                    {
                        produto: _produto_db,
                        almoxarifado: almoxarifado,
                        tipo_movimento: PRODUTO_ESTOQUE_TIPO_MOVIMENTO.ENTRADA,
                        origem_movimento: PRODUTO_ESTOQUE_ORIGEM_MOVIMENTO.NOTA_ENTRADA,
                        quantidade: produto_nota.total_peso,
                        nota_entrada: {
                            _id: nota._id,
                            numero_nota: nota.numero_nota,
                            data_nota: nota.data_nota
                        },
                        empresa: empresa
                    }
                )
            }
            ops.push(
                ProdutosModel.updateOne(
                    {
                        'empresa._id': empresa._id,
                        _id: produto_nota.produto_id,
                    },
                    {
                        $set: {
                            ultima_nota_entrada: {
                                _id: nota._id,
                                data_nota: nota.data_nota,
                                numero_nota: nota.numero_nota
                            }
                        }
                    }
                )
            )
        }

        let inserts_cobrancas = [];

        // Agrupar cobranças por número base para contar total de parcelas
        let cobrancas_por_numero: any = {};
        for (let cob of nota.cobrancas) {
            // Extrair número base da cobrança (antes da barra)
            let numero_base = cob.numero_cobranca.split('/')[0];
            if (!cobrancas_por_numero[numero_base]) {
                cobrancas_por_numero[numero_base] = [];
            }
            cobrancas_por_numero[numero_base].push(cob);
        }

        for (let cob of nota.cobrancas) {
            cob._id = new mongoose.Types.ObjectId();
            // Extrair número base e parcela
            let payload_cob: any = {
                data_emissao: nota.data_nota,
                data_vencimento: cob.data_vencimento,
                forma_pagamento: cob.forma_pagamento.nome,
                identificador: cob.numero_cobranca,
                origem: COBRANCA_ORIGEM.NOTA_ENTRADA,
                status: COBRANCA_STATUS.PENDENTE,
                operacao: COBRANCA_OPERACAO.DEBITO,
                parcela: cob.numero_parcela,
                total_parcelas: cob.total_parcelas,
                valor_bruto: cob.valor,
                valor_juros: 0,
                valor_desconto: 0,
                valor_total: cob.valor,
                valor_recebido: 0,
                parcela_ref: {
                    _id: cob._id,
                    forma_pagamento: {
                        _id: cob.forma_pagamento._id,
                        nome: cob.forma_pagamento.nome,
                        avista: cob.forma_pagamento.avista,
                        dias_intervalo: cob.forma_pagamento.dias_intervalo,
                    },
                    data_vencimento: cob.data_vencimento,
                    valor: cob.valor,
                    numero_parcela: cob.numero_parcela,
                    total_parcelas: cob.total_parcelas,
                    grupo_id: cob.grupo_id
                },
                nota: nota,
                lancamentos: [],
                empresa: empresa,
            }
            inserts_cobrancas.push(payload_cob);
        }
        logDev(`Processando ${inserts.length} lançamentos de peças para nota de entrada ${nota.numero_nota}`);
        await CobrancaModel.insertMany(inserts_cobrancas);
        logDev(`Cadastradas ${inserts_cobrancas.length} cobranças para nota de entrada ${nota.numero_nota}`);
        await ProdutosPecasModel.insertMany(inserts);
        logDev(`Lançados ${inserts.length} peças no estoque para nota de entrada ${nota.numero_nota}`);
        await EntradasNotasModel.updateOne(
            {
                '_id': nota._id,
                'empresa._id': empresa._id,
            },
            {
                $set: {
                    estoque_lancado: true,
                    estoque_lancado_por: {
                        data_hora: dayjs().toDate(),
                        usuario: usuario
                    },
                    cobrancas: nota.cobrancas
                }
            }
        )
        logDev(`Atualizando estoques para nota de entrada ${nota.numero_nota}`);
        await Promise.all(ops);
        logDev(`Estoques atualizados para nota de entrada ${nota.numero_nota}`);
        await ProdutosEstoqueMov.insertMany(inserts_movs_estoque);
        logDev("Lançamentos de movimentação de estoque registrados.");

        logDev(`Estoque atualizado com ${inserts.length} lançamentos a partir da nota de entrada ${nota.numero_nota}`);
        return true;
    } catch (error) {
        throw error;
    }
}
