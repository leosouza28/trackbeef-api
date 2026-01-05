import axios from "axios";
import { NextFunction, Request, Response } from "express";
import fileUpload from "express-fileupload";
import { storage } from "../integrations/firebase";
import { MunicipiosModel } from "../models/municipios.model";
import { USUARIO_STATUS, UsuariosModel } from "../models/usuarios.model";
import ocr from "../ocr";
import { errorHandler, isValidCNPJ, isValidCPF, logDev } from "../util";
import { EmpresaModel } from "../models/empresa.model";
import { CaixaModel } from "../models/caixa.model";
import { AlmoxarifadoModel } from "../models/almoxarifado.model";
import { getAllAvailableScopes } from "../oauth/permissions";
import { PerfilModel } from "../models/perfil.model";
import bcrypt from "bcrypt";
import { PESSOA_MODEL_TIPO_TELEFONE } from "../models/pessoas.model";

export default {
    
    admin: {
        
        getDashboardAdmin: async (req: Request, res: Response, next: NextFunction) => {
            try {
                let response = {};
                res.json(response);
            } catch (error) {
                errorHandler(error, res);
            }
        },
        uploadImage: async (req: Request, res: Response, next: NextFunction) => {
            try {
                let url = '';
                if (Object.keys(req?.files || {}).length) {
                    for (let item in req.files) {
                        let file;
                        if (!Array.isArray(req.files[item])) {
                            file = req.files[item] as fileUpload.UploadedFile;
                            let fileName = file.name;
                            let storageFile = storage.file(`imgs/${fileName}`);
                            let counter = 1;

                            while ((await storageFile.exists())[0]) {
                                const extensionIndex = fileName.lastIndexOf('.');
                                const baseName = extensionIndex !== -1 ? fileName.substring(0, extensionIndex) : fileName;
                                const extension = extensionIndex !== -1 ? fileName.substring(extensionIndex) : '';
                                fileName = `${baseName}(${counter})${extension}`;
                                storageFile = storage.file(`imgs/${fileName}`);
                                counter++;
                            }
                            await storageFile.save(file.data, { metadata: { 'contentType': file.mimetype } });
                            await storageFile.makePublic();
                            url = storageFile.publicUrl();
                        }
                    }
                }
                let decoded_url = decodeURIComponent(url);
                res.json({ url: decoded_url })
            } catch (error) {
                errorHandler(error, res);
            }
        },

    },
    getConsultaCEP: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { cep } = req.query;
            if (!cep) throw new Error("CEP não informado");
            let response;
            try {
                let resp = await axios({
                    method: 'get',
                    url: `https://viacep.com.br/ws/${cep}/json/`,
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                })
                if (!!resp?.data?.logradouro) response = resp.data;
            } catch (error) {
                logDev(error);
                throw new Error(`Erro ao consultar o CEP`);
            }
            if (!response) throw new Error(`Não foi possível consultar o CEP`);
            res.json(response);
        } catch (error) {
            errorHandler(error, res)
        }
    },
    getDefaultValues: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let sexos = [
                { label: "Não informar", value: 'NAO_INFORMAR' },
                { label: "Masculino", value: 'MASCULINO' },
                { label: "Feminino", value: 'FEMININO' }
            ];
            let parentescos = [
                "PAI",
                "MÃE",
                "FILHO",
                "FILHA",
                "AVÔ",
                "AVÓ",
                "MARIDO",
                "ESPOSA",
                "NETO",
                "NETA",
                "IRMÃO",
                "IRMÃ",
                "SOGRO",
                "SOGRA",
                "GENRO",
                "NORA",
                "ENTEADO",
                "ENTEADA",
                "CUNHADO",
                "CUNHADA",
                "AVÔ DO CÔNJUGE",
                "AVÓ DO CÔNJUGE",
                "NETO DO CÔNJUGE",
                "NETA DO CÔNJUGE",
                "OUTRO",
            ].sort(
                (a: string, b: string) => {
                    if (a < b) return -1;
                    if (a > b) return 1;
                    return 0;
                }
            );

            res.json({
                sexos,
                parentescos
            })
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getEstados: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let estados = await MunicipiosModel.aggregate([
                {
                    $group: {
                        _id: "$estado",
                        nome: { $first: "$estado.nome" },
                        sigla: { $first: "$estado.sigla" }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        nome: 1,
                        sigla: 1
                    }
                },
                { $sort: { sigla: 1 } }
            ])
            res.json(estados);
        } catch (error) {
            errorHandler(error, res)
        }
    },
    getCidades: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let estado = req.query.estado;
            if (!estado) throw new Error("Estado não informado");
            let cidades = await MunicipiosModel.aggregate([
                {
                    $match: {
                        "estado.sigla": estado
                    }
                },
                {
                    $group: {
                        _id: "$_id",
                        nome: { $first: "$nome" },
                        estado: { $first: "$estado" }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        nome: 1,
                        estado: 1
                    }
                },
                { $sort: { nome: 1 } }
            ])
            res.json(cidades);
        } catch (error) {
            errorHandler(error, res)
        }
    },
    ocrImageReader: async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (req.files?.image) {
                // @ts-ignore
                let data = await ocr(req.files.image.data, 1);
                return res.json(data);
            }
            throw new Error("Imagem não enviada");
        } catch (error) {
            errorHandler(error, res);
        }
    },
    criarEmpresa: async (req: Request, res: Response, next: NextFunction) => {
        try {

            let { tipo_documento } = req.body;

            let payload = {
                nome: req.body.nome_completo,
                razao_social: req.body.razao_social,
                codigo_acesso: '',
                documento: req.body.documento,
                doc_type: tipo_documento.toUpperCase(),
                email: req.body.email,
                telefones: [req.body.telefone],
                endereco: {
                    cep: req.body.cep,
                    logradouro: req.body.logradouro,
                    numero: req.body.numero,
                    complemento: req.body.complemento,
                    bairro: req.body.bairro,
                    cidade: req.body.cidade,
                    estado: req.body.estado,
                    pais: req.body.pais || 'BR'
                },
                juros: {
                    tipo: 'percentual',
                    dias: 0,
                    valor: 0
                },
                multa: {
                    tipo: 'percentual',
                    dias: 0,
                    valor: 0
                },
                ativo: true
            };
            if (tipo_documento == 'cpf') {
                // Verificar se o CPF é Válido
                isValidCPF(req.body.documento);
                // Verificar se tem o cpf já cadastrado
                let existingCPF = await EmpresaModel.findOne({ documento: req.body.documento });
                if (existingCPF) {
                    throw new Error("CPF já cadastrado");
                }
            }
            if (tipo_documento == 'cnpj') {
                isValidCNPJ(req.body.documento);
                // Verificar se tem o cnpj já cadastrado
                let existingCNPJ = await EmpresaModel.findOne({ documento: req.body.documento });
                if (existingCNPJ) {
                    throw new Error("CNPJ já cadastrado");
                }
            }

            let isUniqueCod = false;
            let codigo_acesso = '';
            while (!isUniqueCod) {
                codigo_acesso = generateUniqueCode(6);
                let existing = await EmpresaModel.findOne({ codigo_acesso });
                if (!existing) isUniqueCod = true;
            }
            payload['codigo_acesso'] = codigo_acesso;
            logDev(req.body);
            // Criar Empresa
            let empresa = new EmpresaModel(payload);
            await empresa.save();
            let usuario_novo = await initializeEmpresa(empresa.toJSON(), {
                email: req.body.email,
                nome: req.body.nome_usuario,
                username: req.body.username,
                telefone: req.body.telefone || '',
                senha: req.body.senha,
            });
            res.json({
                codigo_acesso: codigo_acesso,
                empresa: empresa.toJSON(),
                usuario: usuario_novo
            });
        } catch (error) {
            errorHandler(error, res);
        }
    }
}

function generateUniqueCode(length: number): string {
    const characters = '0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

async function initializeEmpresa(empresa: any, usuario_novo: any) {
    try {
        let _admin_user = await UsuariosModel.findOne({ username: 'admin' });
        let allPermissionsScopes = getAllAvailableScopes().map(scope => scope.key);
        let perfil = new PerfilModel({
            nome: 'Administrador',
            scopes: allPermissionsScopes,
            empresa,
            criado_por: {
                data_hora: new Date(),
                usuario: _admin_user
            }
        })
        await perfil.save();
        // Criar usuário da empresa
        let _user = new UsuariosModel({
            nome: usuario_novo.nome,
            username: usuario_novo.username,
            email: usuario_novo.email,
            senha: bcrypt.hashSync(usuario_novo.senha, 10),
            status: USUARIO_STATUS.ATIVO,
            empresas: [
                {
                    ...empresa,
                    perfil: perfil.toJSON()
                }
            ],
            telefones: usuario_novo?.telefone ? [
                {
                    tipo: PESSOA_MODEL_TIPO_TELEFONE.CEL_WHATSAPP,
                    valor: usuario_novo.telefone,
                    principal: true
                }
            ] : [],
            criado_por: {
                data_hora: new Date(),
                usuario: _admin_user
            }
        })
        await _user.save();
        // Criar Caixa Principal
        let caixa = new CaixaModel({
            nome: 'Caixa Principal',
            saldo: 0,
            principal: true,
            empresa,
            criado_por: {
                data_hora: new Date(),
                usuario: _admin_user
            }
        })
        await caixa.save();
        // Criar Almoxarifado Principal
        let almoxarifado = new AlmoxarifadoModel({
            nome: 'Câmara Principal',
            principal: true,
            empresa,
            criado_por: {
                data_hora: new Date(),
                usuario: _admin_user
            }
        })
        await almoxarifado.save();

        return {
            _id: _user._id.toString(),
            nome: _user.nome,
            username: _user.username,
            email: _user.email
        }
    } catch (error) {
        throw error;
    }
}