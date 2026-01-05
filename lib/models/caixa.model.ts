import mongoose from "mongoose";

const ModelSchema = new mongoose.Schema({
    nome: String,
    saldo: {
        type: Number,
        default: 0
    },
    principal: Boolean,
    empresa: {
        _id: String,
        nome: String
    },
    criado_por: {
        data_hora: Date,
        usuario: {
            _id: String,
            nome: String,
            documento: String,
            username: String
        }
    },
    atualizado_por: {
        data_hora: Date,
        usuario: {
            _id: String,
            nome: String,
            documento: String,
            username: String
        }
    }
}, {
    timestamps: {
        createdAt: 'createdAt',
        updatedAt: 'updatedAt'
    }
});

export const CaixaModel = mongoose.model("caixas", ModelSchema);
