import mongoose from "mongoose";

const ModelSchema = new mongoose.Schema({
    logo: String,
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

    juros: {
        tipo: {
            type: String,
            enum: ['percentual', 'valor_fixo'],
            default: 'percentual'
        },
        dias: {
            type: Number,
            default: 0
        },
        valor: {
            type: Number,
            default: 0
        }
    },
    multa: {
        tipo: {
            type: String,
            enum: ['percentual', 'valor_fixo'],
            default: 'percentual'
        },
        dias: {
            type: Number,
            default: 0
        },
        valor: {
            type: Number,
            default: 0
        }
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

export const EMPRESA_TIPO_DOCUMENTO = {
    
}