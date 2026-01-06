import bodyParser from 'body-parser';
import cors from 'cors';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import 'dotenv/config';
import express from 'express';
import fileUpload from 'express-fileupload';
import mongoose from 'mongoose';
import path from 'path';
import { CaixaMovimentoModel } from './models/caixa-mov.model';
import { CaixaModel } from './models/caixa.model';
import { CobrancaModel } from './models/cobrancas.model';
import { EmpresaModel } from './models/empresa.model';
import { EntradasNotasModel } from './models/entradas-notas.model';
import { ProdutosEstoqueMov } from './models/produtos-estoque-mov.model';
import { ProdutosEstoqueModel } from './models/produtos-estoque.model';
import { ProdutosPecasModel } from './models/produtos-pecas.model';
import { VendasModel } from './models/vendas.model';
import routes from './routes';
import { logDev } from './util';
import { UsuariosModel } from './models/usuarios.model';
import { AlmoxarifadoModel } from './models/almoxarifado.model';
import { PerfilModel } from './models/perfil.model';
import { PessoasModel } from './models/pessoas.model';
import { FormasPagamentoModel } from './models/formas-pagamento.model';
import { CounterModel } from './models/counter.model';
import { ProdutosModel } from './models/produtos.model';
import ocr from './ocr';
import fs from 'fs'

dayjs.locale('pt-br');

declare global {
    namespace Express {
        interface Request {
            usuario?: any;
            logado?: boolean;
            empresa?: any;
        }
    }
}


const server = express(),
    PORT = process.env.DEV === "1" ? process.env.DEV_PORT : process.env.PORT,
    DB_URL = process.env.DB_URL!;

if (!DB_URL) process.exit(1);

let static_path = path.join(__dirname, 'public');
server.use(express.static(static_path));

server.use(fileUpload());
server.use(express.json());
server.use(express.urlencoded({ extended: true }));
server.use(bodyParser.json());
server.use(bodyParser.urlencoded({ extended: true }));
server.use(cors());
server.use(detectFetchAndBody);
server.use(resolveHeaders);
server.use(routes);


async function start() {
    try {
        await mongoose.connect(DB_URL);
        server.listen(PORT, async () => {
            console.log(`Server is running on port ${PORT}`);
            // startDB();
            // try {
            //     let img = fs.readFileSync(__dirname + '/filedemar1.jpeg')
            //     let _ = await ocr(img, 1);
            //     console.log(_)
            // } catch (error) {
            //     console.log(error);
            // }


            // Vincular empresa ao admin
            // let empresa_id = '6951371c6ab01ab90630caa2';
            // let empresa = await EmpresaModel.findOne({ _id: empresa_id }).lean();
            // let perfil = await PerfilModel.findOne({ 'empresa._id': empresa_id, nome: 'Administrador' }).lean();

            // let user = await UsuariosModel.findOne({ username: "admin" }).lean();
            // if (user && empresa) {
            //     let jaTem = false;
            //     for (let emp of user.empresas) {
            //         if (emp._id == empresa_id) {
            //             jaTem = true;
            //             break;
            //         }
            //     }
            //     if (!jaTem) {
            //         await UsuariosModel.updateOne({ _id: user._id }, {
            //             $push: {
            //                 empresas: {
            //                     _id: empresa._id.toString(),
            //                     nome: empresa.nome,
            //                     perfil: {
            //                         _id: perfil?._id.toString() || '',
            //                         nome: perfil?.nome || ''
            //                     },
            //                     ativo: true
            //                 }
            //             }
            //         });
            //         console.log("Vinculada empresa ao admin");
            //     }else{
            //         console.log("Empresa já vinculada ao admin");
            //     }
            // }


            let del = false;
            if (del) {
                let empresa_id = '693c1ecef4b0a33f2784d230'
                await ProdutosEstoqueModel.deleteMany({
                    'empresa._id': empresa_id
                });
                await ProdutosEstoqueMov.deleteMany({
                    'empresa._id': empresa_id
                });
                await ProdutosPecasModel.deleteMany({
                    'empresa._id': empresa_id
                });
                await VendasModel.deleteMany({
                    'empresa._id': empresa_id
                });
                await EntradasNotasModel.deleteMany({
                    'empresa._id': empresa_id
                });
                await CaixaModel.deleteMany({
                    principal: false,
                    'empresa._id': empresa_id
                });
                await CaixaMovimentoModel.deleteMany({
                    'empresa._id': empresa_id
                });
                await CobrancaModel.deleteMany({
                    'empresa._id': empresa_id
                });
                console.log("Clean!")
            }
            // await deleteEmpresaCompleta('69498b47497b9a3da5750a1e')

        });
    } catch (error) {
        console.log('Error connecting to MongoDB:', error);
        process.exit(1);
    }
}

start();

async function resolveHeaders(req: express.Request, res: express.Response, next: express.NextFunction) {
    let userAgent = req.headers["user-agent"];
    let appVersion = req.headers["app-version"];
    let appPlatform = req.headers["app-platform"];
    let _empresa = req.headers['empresa'];

    if (!!_empresa) req.empresa = await EmpresaModel.findOne({ _id: _empresa }).lean();

    if (userAgent?.includes("Google")) {
        return next();
    }
    if (userAgent?.includes('Dart')) {
        userAgent = 'trackbeefApp';
        if (appVersion && appPlatform) {
            userAgent += `/${appVersion} (${appPlatform})`;
        }
    }
    let payload: any = {
        user_agent: userAgent,
        origin: 'not defined',
        country: req.headers['x-appengine-country'],
        city: req.headers['x-appengine-city'],
        region: req.headers['x-appengine-region'],
        latlng: req.headers['x-appengine-latlng'],
        ip: req.headers["x-forwarded-for"] || req.connection.remoteAddress,
    }
    if (userAgent?.includes('trackbeefApp')) {
        payload.origin = 'trackbeefApp';
    }
    payload.ip = payload.ip?.replace('::ffff:', '');
    if (!!req?.path) {
        payload['path'] = req.path;
        payload['method'] = req.method.toUpperCase();
    }

    if (payload?.latlng && payload?.latlng != '0.000000,0.000000') {
        payload.location = {
            latitude: payload.latlng.split(",")[0],
            longitude: payload.latlng.split(",")[1],
        }
    }

    let connection_data: any = {};
    for (let item in payload) {
        if (payload[item] != undefined && payload[item] != null) {
            connection_data[item] = payload[item];
        }
    }
    if (payload.origin == 'not defined' && req.headers['origin']) {
        connection_data.origin = req.headers['origin'];
    }
    if (process.env.DEV === "1") {
        console.log('Connection Data:', connection_data);
    }
    req.connection_data = connection_data;
    next();
}

function printRoutes() {
    let rotas: any[] = [];
    routes.stack.forEach((route: any) => {
        let stack: any[] = route.handle.stack;
        stack.forEach((r) => {
            rotas.push({
                method: Object.keys(r.route.methods)[0].toUpperCase(),
                path: r.route.path,
            })
        })
    });
    let _rotas = rotas.map((r) => `${r.method} ${r.path}`).join("\n");
}
function detectFetchAndBody(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (req.headers['content-type'] === 'application/json' && (req.method === 'POST' || req.method == 'PUT')) {
        const body = req.body;
        if (body && typeof body === 'object') {
            const fetchBody = JSON.stringify(body, null, 2);
            logDev(`${req.method} | ${req.path}`);
            // logDev(fetchBody);
            const requestSizeInMB = Buffer.byteLength(fetchBody, 'utf8') / (1024 * 1024);
            logDev('Request size in MB:', requestSizeInMB.toFixed(2));
        }
    }
    next();
}

async function deleteEmpresaCompleta(empresa_id: string) {
    logDev("Deleting empresa and all related data:", empresa_id);
    await AlmoxarifadoModel.deleteMany({
        'empresa._id': empresa_id
    });
    await CaixaModel.deleteMany({
        'empresa._id': empresa_id
    });
    await CaixaMovimentoModel.deleteMany({
        'empresa._id': empresa_id
    });
    await CobrancaModel.deleteMany({
        'empresa._id': empresa_id
    });
    await CounterModel.deleteMany({
        'empresa._id': empresa_id
    });
    await EntradasNotasModel.deleteMany({
        'empresa._id': empresa_id
    });
    await FormasPagamentoModel.deleteMany({
        'empresa._id': empresa_id
    });
    await ProdutosEstoqueModel.deleteMany({
        'empresa._id': empresa_id
    });
    await ProdutosEstoqueMov.deleteMany({
        'empresa._id': empresa_id
    });
    await ProdutosPecasModel.deleteMany({
        'empresa._id': empresa_id
    });
    await ProdutosModel.deleteMany({
        'empresa._id': empresa_id
    });
    await VendasModel.deleteMany({
        'empresa._id': empresa_id
    });
    await PerfilModel.deleteMany({
        'empresa._id': empresa_id
    });
    await PessoasModel.deleteMany({
        'empresa._id': empresa_id
    });
    await EntradasNotasModel.deleteMany({
        'empresa._id': empresa_id
    });

    let usuarios = await UsuariosModel.find({
        'empresa._id': empresa_id
    });
    for (let usuario of usuarios) {
        if (usuario?.empresas?.length == 1 && usuario?.empresas[0]?._id == empresa_id) {
            await UsuariosModel.deleteOne({ _id: usuario._id });
            logDev("Deleted user:", usuario._id);
        } else {
            // @ts-ignore
            usuario.empresas = usuario.empresas.filter((e: any) => e._id != empresa_id);
            await usuario.save();
            logDev("Removed empresa from user:", usuario._id);
        }
    }
    await EmpresaModel.deleteOne({ _id: empresa_id });
    logDev("Deleted empresa:", empresa_id);
}