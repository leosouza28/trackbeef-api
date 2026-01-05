import mongoose from "mongoose";

const ModelSchema = new mongoose.Schema({
    data_nota: Date,
    fornecedor: {
        _id: String,
        nome: String,
        razao_social: String,
        documento: String
    },
    numero_nota: String,

    qtd_animais: Number,
    peso_animais: Number,
    valor_pago_animais: Number,


    valor_total_nota: Number,

    valor_frete: Number,

    almoxarifado: {
        _id: String,
        nome: String
    },

    produtos: [
        {
            "produto_id": String,
            "produto_nome": String,
            "preco_custo": Number,
            "total_peso": Number,
            "total_valor": Number,
            "lancamentos": [
                {
                    "peso": Number,
                    "preco_custo_unitario": Number,
                    "valor_total": Number
                }
            ],
        }
    ],

    cobrancas: [
        {
            forma_pagamento: {
                _id: String,
                nome: String,
                avista: Boolean,
                dias_intervalo: Number
            },
            numero_cobranca: String,
            data_vencimento: Date,
            valor: Number,
            numero_parcela: Number,
            total_parcelas: Number,
            grupo_id: Number
        }
    ],


    efetuar_fechamento: Boolean,
    cancelado_fechamento_motivo: String,
    cancelado_fechamento: {
        data_hora: Date,
        usuario: {
            _id: String,
            nome: String,
            username: String,
            documento: String,
        }
    },

    situacao: String,

    estoque_lancado: Boolean,
    estoque_lancado_por: {
        data_hora: Date,
        usuario: {
            _id: String,
            nome: String,
            username: String,
            documento: String,
        }
    },

    criado_por: {
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
        createdAt: "createdAt",
        updatedAt: "updatedAt"
    }
});
export const EntradasNotasModel = mongoose.model("entradas-notas", ModelSchema);

export const NOTA_SITUACAO = {
    ABERTA: "ABERTA",
    FECHADA: "FECHADA",
    CANCELADA: "CANCELADA"
}