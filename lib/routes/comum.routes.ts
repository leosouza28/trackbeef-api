import { Router, Request, Response } from 'express';
import { autenticar } from '../oauth';
import comumController from '../controllers/comum.controller';
import packageJson from '../../package.json';
import empresaController from '../controllers/empresa.controller';
import financeiroController from '../controllers/financeiro.controller';

const router = Router();

router.get('/', autenticar, (req: Request, res: Response) => {
    res.json({ message: `API TrackBeef ${packageJson.version}` });
});
router.get('/public/estados', comumController.getEstados);
router.get('/public/cidades', comumController.getCidades);
router.get('/public/cep', comumController.getConsultaCEP);
router.get('/public/default-values', comumController.getDefaultValues);

router.post('/image-reader/notas/ocr', autenticar, comumController.ocrImageReader);
router.post('/public/image-uploader', autenticar, comumController.admin.uploadImage);

router.post('/public/empresa', comumController.criarEmpresa);

router.get('/public/cliente/:id/faturas', financeiroController.public.getFaturasCliente);


export default router;