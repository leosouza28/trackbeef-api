import mongoose from "mongoose";

const ModelSchema = new mongoose.Schema({
    foto_url: String,
    username: String,
    documento: String,
    doc_type: {
        type: String,
        default: 'CPF'
    },
    nome: String,
    senha: String,
    status: String,
    telefones: [
        {
            tipo: String,
            valor: String,
            principal: Boolean
        }
    ],
    ultimo_acesso: Date,
    ultimo_ip: String,
    ultimo_user_agent: String,
    empresas: [
        {
            _id: String,
            nome: String,
            perfil: {
                _id: String,
                nome: String
            }
        }
    ],
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
    }
}, {
    timestamps: {
        createdAt: "createdAt",
        updatedAt: "updatedAt"
    }
});

export const UsuariosModel = mongoose.model("usuarios", ModelSchema);

export const USUARIO_DOC_TYPE = {
    CPF: "CPF",
    PASSAPORTE: "PASSAPORTE"
}
