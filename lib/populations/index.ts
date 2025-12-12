import axios from 'axios';
import bcrypt from 'bcrypt';
import { MunicipiosModel } from '../models/municipios.model';
import { logDev } from '../util';
import { EmpresaModel } from '../models/empresa.model';
import { PerfilModel } from '../models/perfil.model';
import { PESSOA_MODEL_STATUS, PESSOA_MODEL_TIPO_TELEFONE } from '../models/pessoas.model';
import { UsuariosModel } from '../models/usuarios.model';


export async function startDB() {
    try {
        logDev("Starting DB population...");
        await setAdmin();
        await getSetMunicipios();
    } catch (error) {
        console.log(error);
    }
}


async function setAdmin() {
    logDev("Create super")
    let empresa_default = await EmpresaModel.findOneAndUpdate(
        {
            nome: "Meu Negócio"
        },
        {
            $set: {
                razao_social: "Empresa Padrão",
                codigo_acesso: "000000",
                doc_type: "CNPJ",
                documento: "30727693000180",
                email: "lsouzaus@gmail.com",
                telefones: ["91983045923"],
                endereco: {
                    cep: "68743250",
                    logradouro: "Rua Kazuma Oyama",
                    numero: "2577",
                    complemento: "Casa 47",
                    bairro: "Estrela",
                    cidade: "Castanhal",
                    estado: "PA",
                    pais: "BR"
                },
                ativo: true
            }
        },
        { new: true, upsert: true }
    );
    let perfil_default = await PerfilModel.findOneAndUpdate(
        {
            'nome': "Administrador",
            'empresa._id': empresa_default._id
        },
        {
            $set: {
                nome: "Administrador",
                empresa: {
                    _id: empresa_default._id,
                    nome: empresa_default.nome
                },
                scopes: ['*']
            }
        },
        {
            new: true, upsert: true
        }
    )
    let empresa_perfil = [
        {
            _id: empresa_default._id,
            nome: empresa_default.nome,
            perfil: {
                _id: perfil_default._id,
                nome: perfil_default.nome
            }
        }
    ]
    let telefone = "91983045923"
    await UsuariosModel.updateOne(
        { documento: "02581748206" },
        {
            $set: {
                nome: "Administrador",
                username: "admin",
                documento: "02581748206",
                doc_type: "CPF",
                senha: bcrypt.hashSync("leo1010", 10),
                status: PESSOA_MODEL_STATUS.ATIVO,
                telefones: [
                    {
                        tipo: PESSOA_MODEL_TIPO_TELEFONE.CEL_WHATSAPP,
                        valor: telefone,
                        principal: true
                    }
                ],
                telefone_principal: {
                    tipo: PESSOA_MODEL_TIPO_TELEFONE.CEL_WHATSAPP,
                    valor: telefone
                },
                empresas: empresa_perfil
            },
        },
        { upsert: true }
    )
    logDev("End super")
}

async function getSetMunicipios() {
    try {
        logDev("Fetching...")
        let response1 = await axios.get('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome');

        let bulks: any[] = []
        for (let item of response1.data) {
            let response2 = await axios.get(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${item.sigla}/municipios`);
            for (let municipio of response2.data) {
                let filter = {
                    id: municipio.id,
                    "estado.id": item.id
                }
                bulks.push({
                    updateOne: {
                        filter,
                        update: {
                            $set: {
                                id: municipio.id,
                                nome: municipio.nome,
                                estado: {
                                    id: item.id,
                                    nome: item.nome,
                                    sigla: item.sigla,
                                }
                            }
                        },
                        upsert: true
                    }
                })
            }
        }
        let bulk_response = await MunicipiosModel.bulkWrite(bulks);
        logDev("Done!", bulk_response);
    } catch (error) {
        logDev("Error", error);

    }

}

