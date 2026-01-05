import mongoose from "mongoose";

const ModelSchema = new mongoose.Schema({
    produto: {
        _id: String,
        sku: String,
        nome: String,
        sigla: String,
        categoria: String,
        unidade: String
    },
    nota: {
        _id: String,
        numero_nota: String,
        data_nota: Date,
        fornecedor: {
            _id: String,
            nome: String,
            razao_social: String,
            documento: String
        }
    },
    venda: {
        _id: String,
        data: Date,
        codigo: String,
        cliente: {
            _id: String,
            nome: String,
            razao_social: String,
            documento: String
        }
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

    status_estoque: {
        type: String,
        enum: ['EM ESTOQUE', 'VENDIDO', 'RESERVADO', 'PERDIDO'],
        default: 'EM ESTOQUE'
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
export const ProdutosPecasModel = mongoose.model("produtos-pecas", ModelSchema);

export const PRODUTOS_PECAS_STATUS_ESTOQUE = {
    EM_ESTOQUE: 'EM ESTOQUE',
    VENDIDO: 'VENDIDO',
    RESERVADO: 'RESERVADO',
    PERDIDO: 'PERDIDO',
}