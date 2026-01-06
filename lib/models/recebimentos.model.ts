import mongoose from "mongoose";
import { format } from "path";

const ModelSchema = new mongoose.Schema({
    data_pagamento: Date,
    forma_pagamento: {
        _id: String,
        nome: String,
    },
    cliente: {
        _id: String,
        nome: String,
        razao_social: String,
        documento: String
    },
    valor: Number,
    lancamentos: [
        {
            tipo: String,
            venda: {
                _id: String,
                codigo: String,
                data: Date
            },
            valor: Number,
        }
    ],
    criado_por: {
        data_hora: Date,
        usuario: {
            _id: String,
            nome: String
        }
    },
    atualizado_por: {
        data_hora: Date,
        usuario: {
            _id: String,
            nome: String
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

export const RecebimentosModel = mongoose.model("recebimentos", ModelSchema);

export const RECEBIMENTO_LANCAMENTO_TIPO = {
    RECEBIMENTO_VENDA: "RECEBIMENTO VENDA",
}
