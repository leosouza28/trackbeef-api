import mongoose from "mongoose";

const ModelSchema = new mongoose.Schema({
    nome: String,
    razao_social: String,
    codigo_acesso: String,
    documento: String,
    doc_type: String,
    telefones: [String],
    email: String,
    endereco: {
        cep: String,
        logradouro: String,
        numero: String,
        complemento: String,
        bairro: String,
        cidade: String,
        estado: String,
        pais: String
    },
    ativo: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: {
        createdAt: 'createdAt',
        updatedAt: 'updatedAt'
    }
});

export const EmpresaModel = mongoose.model("empresas", ModelSchema);
