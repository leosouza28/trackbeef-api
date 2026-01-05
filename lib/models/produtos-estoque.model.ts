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
        custo_medio: Number
    },
    saldo_estoque: {
        type: Number,
        default: 0
    },
    saldo_estoque_reservado: {
        type: Number,
        default: 0
    },
    almoxarifado: {
        _id: String,
        nome: String
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
export const ProdutosEstoqueModel = mongoose.model("produtos-estoques", ModelSchema);

