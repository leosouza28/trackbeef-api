import mongoose from "mongoose";
import { format } from "path";

const ModelSchema = new mongoose.Schema({
    data: Date,
    codigo: String,
    cliente: {
        _id: String,
        nome: String,
        razao_social: String,
        documento: String
    },
    endereco: {
        cep: String,
        logradouro: String,
        numero: String,
        complemento: String,
        bairro: String,
        cidade: String,
        estado: String
    },
    itens: [
        {
            _id: String,
            produto: {
                _id: String,
                sku: String,
                nome: String,
                sigla: String,
                categoria: String,
                unidade: String,
                status: String,
                custo_medio: Number,
                preco_custo: Number,
                preco_venda: Number,
            },
            peca: {
                _id: String,
                produto: {
                    _id: String,
                    sku: String,
                    nome: String,
                    sigla: String,
                    categoria: String,
                    unidade: String,
                },
                unidade: String,
                peso: Number,
                preco_custo_unitario: Number,
                valor_custo: Number,
                valor_total: Number,
                almoxarifado: {
                    _id: String,
                    nome: String
                },
                status_estoque: String
            },
            unidade_saida: String,
            tipo_saida: String,
            quantidade: Number,
            preco_unitario: Number,
            valor_total: Number,
            valor_desconto: Number,
            valor_total_liquido: Number,
        }
    ],
    valor_bruto: Number,
    valor_desconto: Number,
    valor_liquido: Number,
    valor_recebido: Number,

    parcelas: [
        {
            forma_pagamento: {
                _id: String,
                nome: String,
                avista: Boolean,
                dias_intervalo: Number,
            },
            data_vencimento: Date,
            valor: Number,
            numero_parcela: Number,
            total_parcelas: Number,
            grupo_id: Number
        }
    ],

    status: String,
    status_entrega: String,
    status_quitacao: String,
    venda_na_conta: Boolean,

    observacao: String,

    criado_por: {
        data_hora: Date,
        usuario: {
            _id: String,
            nome: String,
            username: String,
            documento: String,
        }
    },
    fechado_por: {
        data_hora: Date,
        usuario: {
            _id: String,
            nome: String,
            username: String,
            documento: String,
        }
    },
    cancelado_por: {
        data_hora: Date,
        usuario: {
            _id: String,
            nome: String,
            username: String,
            documento: String,
        }
    },
    atualizado_por: {
        data_hora: Date,
        usuario: {
            _id: String,
            nome: String,
            username: String,
            documento: String,
        }
    },

    empresa: {
        _id: String,
        nome: String
    }

}, {
    timestamps: {
        createdAt: 'createdAt',
        updatedAt: 'updatedAt'
    }
});

export const VendasModel = mongoose.model("vendas", ModelSchema);

export const VENDA_STATUS = {
    ABERTA: "ABERTA",
    CONCLUIDA: "CONCLUIDA",
    CANCELADA: "CANCELADA"
}
export const VENDA_STATUS_ENTREGA = {
    NENHUM: "NENHUM",
    PENDENTE: "PENDENTE",
    EM_TRANSITO: "EM_TRANSITO",
    ENTREGUE: "ENTREGUE"
}
export const VENDA_STATUS_QUITACAO = {
    PENDENTE: "PENDENTE",
    PARCIAL: "PARCIAL",
    QUITADA: "QUITADA"
}