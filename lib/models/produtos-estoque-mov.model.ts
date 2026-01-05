import mongoose from "mongoose";

const ModelSchema = new mongoose.Schema({
    produto: {
        _id: String,
        sku: String,
        nome: String,
        sigla: String,
        categoria: String,
        unidade: String,
        tipo_saida: String,
    },
    almoxarifado: {
        _id: String,
        nome: String
    },
    tipo_movimento: String,
    origem_movimento: String,
    quantidade: Number,
    quantidade_unitaria: Number,
    nota_entrada: {
        _id: String,
        numero_nota: String,
        data_nota: Date
    },
    venda: {
        _id: String,
        codigo: String,
        data: Date,
        cliente: {
            _id: String,
            nome: String,
            razao_social: String,
            documento: String
        },
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
export const ProdutosEstoqueMov = mongoose.model("produtos-estoques-mov", ModelSchema);

export const PRODUTO_ESTOQUE_TIPO_MOVIMENTO = {
    ENTRADA: 'ENTRADA',
    SAIDA: 'SAIDA'
}

export const PRODUTO_ESTOQUE_ORIGEM_MOVIMENTO = {
    CANCELAMENTO_NOTA_ENTRADA: 'CANCELAMENTO_NOTA_ENTRADA',
    NOTA_ENTRADA: 'NOTA_ENTRADA',
    VENDA: 'VENDA',
    CANCELAMENTO_VENDA: 'CANCELAMENTO_VENDA',
    AJUSTE: 'AJUSTE',
    TRANSFERENCIA_LOCAL: 'TRANSFERENCIA_LOCAL',
    LANCAMENTO_AVULSO: 'LANCAMENTO_AVULSO',
}