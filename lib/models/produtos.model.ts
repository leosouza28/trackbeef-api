import mongoose from "mongoose";

const ModelSchema = new mongoose.Schema({
    sku: String,
    nome: String,
    sigla: String,
    categoria: String,
    unidade: String,
    status: String,
    prioridade: { type: Number, default: 1 },

    custo_medio: Number,
    preco_custo: Number,
    preco_venda: Number,

    tipo_saida: String,

    calcula_rendimento_entrada_nota: Boolean,

    ultima_nota_entrada: {
        _id: String,
        data_nota: Date,
        numero_nota: String
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
export const ProdutosModel = mongoose.model("produtos", ModelSchema);

export const PRODUTO_STATUS = {
    ATIVO: 'ATIVO',
    INATIVO: 'INATIVO',
}

export const PRODUTO_UNIDADES = {
    UN: 'Unidade',
    KG: 'Quilograma',
}

export const PRODUTO_TIPO_SAIDA = {
    ESTOQUE_PECA: 'ESTOQUE PECA',
    ESTOQUE_PADRAO: 'ESTOQUE PADRAO',
}
