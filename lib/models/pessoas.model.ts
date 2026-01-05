import mongoose from "mongoose";

interface IPessoaTelefone {
    tipo: string;
    valor: string;
    principal?: boolean
}

interface IPessoaEndereco {
    cep: string;
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    estado: string;
}

export interface IPessoa {
    _id?: string;
    razao_social?: string;
    documento?: string;
    doc_type?: string;
    nome?: string;
    email?: string;
    senha?: string;
    data_nascimento?: Date | null;
    email_confirmacao_token?: string;
    sexo?: string;
    status?: string;
    telefone_principal?: IPessoaTelefone | null;
    telefones?: IPessoaTelefone[];
    endereco?: IPessoaEndereco;
    criado_por?: {
        data_hora: Date;
        usuario: IPessoa;
    };
    atualizado_por?: {
        data_hora: Date;
        usuario: IPessoa;
    };
    createdAt?: Date;
    updatedAt?: Date;
}

const ModelSchema = new mongoose.Schema({
    tipos: [String],
    doc_type: {
        type: String,
        default: 'cpf'
    },
    documento: String,
    nome: String,
    razao_social: String,
    email: String,
    data_nascimento: Date,
    sexo: String,
    status: String,
    dias_cobranca: Number,
    telefone_principal: {
        tipo: String,
        valor: String
    },
    telefones: [
        {
            tipo: String,
            valor: String,
            principal: Boolean
        }
    ],
    empresa: {
        _id: String,
        nome: String,
    },
    endereco: {
        cep: String,
        logradouro: String,
        numero: String,
        complemento: String,
        bairro: String,
        cidade: String,
        estado: String
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
    }
}, {
    timestamps: {
        createdAt: "createdAt",
        updatedAt: "updatedAt"
    }
});

export const PessoasModel = mongoose.model("pessoas", ModelSchema);

export const PESSOA_DOC_TYPE = {
    CPF: "CPF",
    CNPJ: "CNPJ"
}
export const PESSOA_SEXO = {
    MASCULINO: "MASCULINO",
    FEMININO: "FEMININO",
    NAO_INFORMAR: "NAO_INFORMAR"
}

export const PESSOA_MODEL_STATUS = {
    ATIVO: "ATIVO",
    BLOQUEADO: "BLOQUEADO",
}

export const PESSOA_MODEL_TIPO_TELEFONE = {
    CEL_WHATSAPP: "CEL_WHATSAPP",
    WHATSAPP: "WHATSAPP",
    CELULAR: "CELULAR",
    FIXO: "FIXO"
}
export const PESSOA_TIPO = {
    CLIENTE: "CLIENTE",
    FORNECEDOR: "FORNECEDOR",
}
export const PESSOA_DEFAULT_VALUES_INPUT = {
    _id: String,
    nome: String,
    razao_social: String,
    email: String,
    sexo: String,
    doc_type: String,
    data_nascimento: Date,
    documento: String,
    telefone_principal: {
        tipo: String,
        valor: String
    },
    telefones: [
        {
            tipo: String,
            valor: String,
            principal: Boolean
        }
    ],
    endereco: {
        cep: String,
        logradouro: String,
        numero: String,
        complemento: String,
        bairro: String,
        cidade: String,
        estado: String
    }
}
