import bcrypt from 'bcrypt';
import dayjs from "dayjs";
import { NextFunction, Request, Response } from "express";
import { PESSOA_MODEL_STATUS, PESSOA_MODEL_TIPO_TELEFONE, PessoasModel } from '../models/pessoas.model';
import { UsuariosModel } from "../models/usuarios.model";
import { gerarSessao, NAO_AUTORIZADO } from "../oauth";
import { getAllAvailableScopes } from '../oauth/permissions';
import { errorHandler, isValidCNPJ, isValidCPF, isValidTelefone } from "../util";
import { PerfilModel } from '../models/perfil.model';
import { VendasModel } from '../models/vendas.model';



const USER_ERRORS = {
    INVALID_DOCUMENT: 'Documento inválido',
    USER_NOT_FOUND: 'Usuário não encontrado',
    USER_BLOCKED: 'Usuário bloqueado',
    INCORRECT_PASSWORD: 'Senha incorreta',
    USER_WITHOUT_PASSWORD: 'Usuário não possui senha cadastrada'
}

export default {
    getPessoasById: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let pessoa = await PessoasModel.findOne({ _id: req.params.id, 'empresa._id': req.empresa._id }).lean();
            if (!pessoa) throw new Error("Pessoa não encontrada.");
            res.json(pessoa);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getPessoas: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { perpage, page, sort_by, ...query } = req.query;

            let busca = req.query?.q || "";
            let lista: any = [], total = 0,
                porpagina = 10, pagina = 0, skip = 0, limit = 0;

            if (perpage && page) {
                porpagina = Number(perpage);
                pagina = Number(page);
                pagina--
                skip = porpagina * pagina;
                limit = porpagina;
            }

            let find: any = {
                'empresa._id': req.empresa._id,
                $or: [
                    { documento: { $regex: busca, $options: 'i' } },
                    { nome: { $regex: busca, $options: 'i' } },
                    { email: { $regex: busca, $options: 'i' } }
                ]
            }
            if (query?.tipo == 'FORNECEDOR') {
                find['tipos'] = 'FORNECEDOR';
            }
            if (query?.tipo == 'CLIENTE') {
                find['tipos'] = 'CLIENTE';
            }

            let sort: any = { createdAt: -1 };
            if (sort_by == 'nome') sort = { nome: 1 };

            total = await PessoasModel.find(find).countDocuments();
            lista = await PessoasModel.find(find)
                .skip(skip)
                .limit(limit)
                .sort(sort)
                .lean();

            res.json({ lista, total })
        } catch (error) {
            errorHandler(error, res);
        }
    },
    addPessoa: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let payload: any = {
                'tipos': req.body.tipos,
                'doc_type': req.body.doc_type,
                'documento': req.body.documento,
                'nome': req.body.nome,
                'razao_social': req.body.razao_social,
                'dias_cobranca': req.body?.dias_cobranca || null,
                'data_nascimento': req.body?.data_nascimento ? dayjs(req.body.data_nascimento).toDate() : null,
                'email': req.body.email,
                'status': req.body.status,
                'telefones': req.body.telefones,
                'endereco': req.body.endereco,
                'sexo': req.body?.sexo || "",
                'atualizado_por': {
                    data_hora: dayjs().toDate(),
                    // @ts-ignore
                    usuario: req.usuario
                }
            }
            if (req.body.telefones.length > 0) {
                payload.telefone_principal = req.body.telefones.find((item: any) => item.principal);
            }
            let doc = null;
            if (!!req.body?._id) {
                let _pessoa_db = await PessoasModel.findOne({ _id: req.body._id, 'empresa._id': req.empresa._id });
                if (!_pessoa_db) throw new Error("Pessoa não encontrada.");
                // Checa se o docuemnto informado é diferente do atual
                if (!!req.body?.documento && _pessoa_db.documento != req.body.documento) {
                    let has_doc = await PessoasModel.findOne({ documento: req.body.documento, 'empresa._id': req.empresa._id }).lean();
                    if (has_doc) throw new Error("Já existe uma pessoa com esse documento.");
                }
                doc = await PessoasModel.findOneAndUpdate(
                    {
                        _id: req.body._id,
                        'empresa._id': req.empresa._id
                    },
                    {
                        $set: {
                            ...payload,
                            'empresa._id': req.empresa._id
                        }
                    },
                    {
                        new: true
                    }
                )
                await VendasModel.updateMany(
                    { 'cliente._id': req.body._id },
                    { $set: { 'cliente': doc } }
                )
            } else {
                // Check se documento existe
                if (!!req.body?.documento) {
                    let has_doc = await PessoasModel.findOne({ documento: req.body.documento, 'empresa._id': req.empresa._id }).lean();
                    if (has_doc) throw new Error("Já existe uma pessoa com esse documento.");
                }
                payload.criado_por = {
                    data_hora: dayjs().toDate(),
                    usuario: req.usuario
                }
                payload.empresa = req.empresa;
                doc = new PessoasModel(payload);
                await doc.save();
            }
            res.json(doc);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    me: async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req?.usuario?._id && !req?.logado) throw NAO_AUTORIZADO;

            let is_cpf_valid = false;
            try {
                isValidCPF(req.usuario?.documento);
                is_cpf_valid = true;
            } catch (error) { }
            if (req.usuario && is_cpf_valid) req.usuario.doc_type = 'cpf';
            else if (req.usuario && !is_cpf_valid) req.usuario.doc_type = 'passaporte';


            res.json(req.usuario);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    login: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { documento, senha } = req.body;
            let { empresa } = req.headers;
            if (!empresa) throw new Error("Empresa é obrigatória no cabeçalho da requisição.");
            if (!documento || !senha) throw new Error('Documento e senha são obrigatórios.')
            let usuario = await UsuariosModel.findOne({
                $or: [
                    {
                        username: documento
                    }
                ],
                'empresas._id': empresa
            }).lean();
            if (!usuario) throw new Error(USER_ERRORS.USER_NOT_FOUND);
            if (!usuario?.senha) throw new Error(USER_ERRORS.USER_WITHOUT_PASSWORD);
            if (usuario.status != PESSOA_MODEL_STATUS.ATIVO) throw new Error(USER_ERRORS.USER_BLOCKED);
            // @ts-ignore
            if (process.env.DEV !== '1') if (!bcrypt.compareSync(senha, usuario.senha)) throw new Error(USER_ERRORS.INCORRECT_PASSWORD);

            let sessao = await gerarSessao(usuario._id);

            res.json(sessao);
        } catch (error: any) {
            if (error?.message == USER_ERRORS.USER_NOT_FOUND) {
            }
            errorHandler(error, res);
        }
    },
    getUsuario: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { id, busca_por, tipo_documento, documento } = req.query;
            let usuario = null;
            if (!!busca_por) {
                if (busca_por == 'cliente' && !!documento) {
                    throw new Error("STOP!");
                    // usuario = await UsuariosModel.findOne({ documento: documento, niveis: USUARIO_NIVEL.CLIENTE }).lean();
                } else {
                    throw new Error("Consulta não identificada");
                }
            } else {
                usuario = await UsuariosModel.findOne({ _id: id }).lean();
            }
            if (!usuario) throw new Error('Usuário não encontrado.');
            if (usuario?.senha) delete usuario.senha;
            if (!usuario?.doc_type) usuario.doc_type = 'cpf';
            // @ts-ignore
            usuario._empresa = usuario.empresas.find(e => e._id === String(req.empresa._id));
            res.json(usuario);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getPermissoes: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let permissoes = getAllAvailableScopes();
            res.json(permissoes);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getVendedores: async (req: Request, res: Response, next: NextFunction) => {
        try {
            // let vendedores = await UsuariosModel.find({}).sort({ nome: 1 }).lean();

            // if (!req.usuario?.scopes?.includes('*')) {
            //     if (req.usuario?.niveis?.includes(USUARIO_NIVEL.VENDEDOR) && !req.usuario?.niveis?.includes(USUARIO_NIVEL.SUPERVISOR_VENDAS)) {
            //         // @ts-ignore
            //         vendedores = vendedores.filter(v => v._id.toString() == req.usuario._id.toString());
            //     }
            // }
            res.json({ lista: [], total: 0 });
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getUsuarios: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let { perpage, page, status, ...query } = req.query;

            // @ts-ignore
            // if (!isScopeAuthorized('usuarios.leitura', req.usuario?.scopes)) {
            //     throw UNAUTH_SCOPE
            // }
            let busca = req.query?.q || "";
            let lista: any = [], total = 0,
                porpagina = 10, pagina = 0, skip = 0, limit = 0;

            if (perpage && page) {
                porpagina = Number(perpage);
                pagina = Number(page);
                pagina--
                skip = porpagina * pagina;
                limit = porpagina;
            }

            let find: any = {
                'empresas._id': req.empresa._id,
                $or: [
                    { documento: { $regex: busca, $options: 'i' } },
                    { nome: { $regex: busca, $options: 'i' } },
                    { email: { $regex: busca, $options: 'i' } }
                ],
                username: { $ne: 'admin' }
            }

            if (status != 'TODOS') find['status'] = status

            total = await UsuariosModel.find(find).countDocuments();
            lista = await UsuariosModel.find(find)
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 })
                .lean();

            lista.map((usuario: any) => {
                let _empresa = usuario.empresas.find((e: any) => e._id.toString() === req.empresa._id.toString());
                usuario.empresa = _empresa;
            })

            res.json({ lista, total })
        } catch (error) {
            errorHandler(error, res);
        }
    },
    setPerfis: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let _id = req.body._id;
            if (!!_id) {
                let _perfil = await PerfilModel.findOne({ _id, 'empresa._id': req.empresa._id });
                if (!_perfil) throw new Error("Perfil não encontrado.");
                _perfil.nome = req.body.nome;
                _perfil.scopes = req.body.scopes || [];
                _perfil.atualizado_por = {
                    data_hora: dayjs().toDate(),
                    // @ts-ignore
                    usuario: req.usuario
                }
                await _perfil.save();
            } else {
                let has_same_name = await PerfilModel.findOne({ 'nome': req.body.nome, 'empresa._id': req.empresa._id });
                if (has_same_name) throw new Error("Já existe um perfil com esse nome.");
                let novo_perfil = new PerfilModel({
                    nome: req.body.nome,
                    scopes: req.body.scopes || [],
                    empresa: req.empresa,
                    criado_por: {
                        data_hora: dayjs().toDate(),
                        // @ts-ignore
                        usuario: req.usuario
                    }
                });
                await novo_perfil.save();
            }
            res.json(true);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getPerfis: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let find = {
                'empresa._id': req.empresa._id
            }
            let lista = await PerfilModel.find(find).lean();
            let total = await PerfilModel.find(find).countDocuments();
            res.json({ lista, total });
        } catch (error) {
            errorHandler(error, res);
        }
    },
    getPerfisById: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let perfil = await PerfilModel.findOne({ _id: req.params.id, 'empresa._id': req.empresa._id }).lean();
            if (!perfil) throw new Error("Perfil não encontrado.");
            res.json(perfil);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    addUsuarioSimples: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let doc, now = dayjs().toDate();
            let payload: any = {
                nome: req.body.nome,
                documento: req.body.documento,
                data_nascimento: null,
                telefone_principal: null,
                telefones: [],
                origem_cadastro: "ADMINISTRADOR",
                status: PESSOA_MODEL_STATUS.ATIVO,
                criado_por: {
                    data_hora: now,
                    // @ts-ignore
                    usuario: req.usuario
                }
            }
            if (!!req?.body?.data_nascimento) {
                payload.data_nascimento = dayjs(req.body.data_nascimento).toDate();
            }
            if (!!req.body?.telefone) {
                await isValidTelefone(req.body.telefone);
                payload.telefones.push({
                    principal: true,
                    tipo: PESSOA_MODEL_TIPO_TELEFONE.CELULAR,
                    valor: req.body.telefone
                })
                payload.telefone_principal = {
                    tipo: PESSOA_MODEL_TIPO_TELEFONE.CELULAR,
                    valor: req.body.telefone
                }
            }
            await validarUsuario(payload)
            doc = new UsuariosModel(payload);
            await doc.save();

            // @ts-ignore
            gerarLead(payload, req.usuario).catch(err => console.log("Errrrr"));

            res.json(doc);
        } catch (error) {
            errorHandler(error, res);
        }
    },
    addUsuario: async (req: Request, res: Response, next: NextFunction) => {
        try {
            let doc, now = dayjs().toDate();

            // @ts-ignore
            // if (!isScopeAuthorized('usuarios.editar', req.usuario?.scopes)) {
            //     throw UNAUTH_SCOPE
            // }

            let payload: any = {
                nome: req.body.nome,
                username: req.body.username,
                documento: req.body.documento,
                email: req.body?.email || null,
                telefones: [],
                telefone_principal: null,
            }
            if (!!req.body?.documento) {
                if (req.body.documento.length == 11) {
                    isValidCPF(req.body.documento)
                }
                if (req.body.documento.length > 11) {
                    isValidCNPJ(req.body.documento)
                }
            }
            payload.username = payload.username.trim().toLowerCase();

            if (!req.body?._id) payload.senha = bcrypt.hashSync(req.body.senha, 10);

            for (let tel of req.body.telefones) {
                let telefone = {
                    tipo: tel.tipo,
                    valor: tel.valor,
                    principal: tel?.principal || false
                }
                payload.telefones.push(telefone);
                if (tel?.principal) payload.telefone_principal = telefone;
            }

            if (!!req.body?._id) {
                payload.atualizado_por = {
                    data_hora: now,
                    // @ts-ignore
                    usuario: req.usuario
                }
                if (!!req.body?.senha) payload.senha = bcrypt.hashSync(req.body.senha, 10);

                let _usuario = await UsuariosModel.findOne({ _id: req.body._id }).lean();
                if (!_usuario) throw new Error("Usuário não encontrado.");

                // Checa se o docuemnto informado é diferente do atual
                if (_usuario.documento != req.body.documento) {
                    let has_user_doc = await UsuariosModel.findOne({ documento: req.body.documento, 'empresas._id': req.empresa._id, _id: { $ne: req.body._id } }).lean();
                    if (has_user_doc) throw new Error("Documento já cadastrado!");
                }
                // Checa se o username informado é diferente do atual
                if (_usuario.username != req.body.username) {
                    let has_username = await UsuariosModel.findOne({ username: req.body.username, 'empresas._id': req.empresa._id, _id: { $ne: req.body._id } }).lean();
                    if (has_username) throw new Error("Nome de usuário já cadastrado!");
                }
                // Checa o perfil
                if (!!req.body?.perfil) {
                    let _perfil = await PerfilModel.findOne({ _id: req.body.perfil, 'empresa._id': req.empresa._id }).lean();
                    if (!_perfil) throw new Error("Perfil não encontrado.");
                    let empresa_index = _usuario.empresas.findIndex(e => e._id === String(req.empresa._id));
                    if (empresa_index >= 0) {
                        _usuario.empresas[empresa_index].perfil = {
                            // @ts-ignore
                            _id: _perfil._id,
                            nome: _perfil.nome
                        }
                        if (req.body.perfil_ativo === true || req.body.perfil_ativo === false) {
                            _usuario.empresas[empresa_index].ativo = req.body.perfil_ativo;
                        }
                        await UsuariosModel.updateOne({ _id: req.body._id }, {
                            $set: {
                                empresas: _usuario.empresas
                            }
                        })
                    }
                }

                await UsuariosModel.updateOne({ _id: req.body._id }, {
                    $set: { ...payload }
                })
            } else {
                payload.criado_por = {
                    data_hora: now,
                    // @ts-ignore
                    usuario: req.usuario
                }
                payload.empresas = [req.empresa];
                if (!!req.body?.perfil) {
                    let _perfil = await PerfilModel.findOne({ _id: req.body.perfil, 'empresa._id': req.empresa._id }).lean();
                    if (!_perfil) throw new Error("Perfil não encontrado.");
                    payload.empresas[0].perfil = {
                        _id: _perfil._id,
                        nome: _perfil.nome
                    }
                    if (req.body.perfil_ativo === true || req.body.perfil_ativo === false) {
                        payload.empresas[0].ativo = req.body.perfil_ativo;
                    }
                }
                let has_user_doc = await UsuariosModel.findOne({ documento: req.body.documento, 'empresas._id': req.empresa._id }).lean();
                if (has_user_doc) throw new Error("Documento já cadastrado!");
                let has_username = await UsuariosModel.findOne({ username: req.body.username, 'empresas._id': req.empresa._id }).lean();
                if (has_username) throw new Error("Nome de usuário já cadastrado!");

                doc = new UsuariosModel(payload).save()
                doc = (await doc).toJSON()
            }

            res.json(doc);
        } catch (error) {
            errorHandler(error, res);
        }
    },

}

async function validarUsuario(usuario: any) {
    try {
        if (!usuario?.documento) throw new Error("Documento é obrigatório!");
        if (!usuario?.username) throw new Error("Nome de usuário é obrigatório!");
        isValidCPF(usuario.documento)
        if (!usuario?.nome) throw new Error("Nome é obrigatório!");
        for (let tel of (usuario?.telefones || [])) {
            if (!tel?.valor) throw new Error("Número de telefone é obrigatório!");
            await isValidTelefone(tel.numero);
        }
    } catch (error) {
        throw error
    }
}

