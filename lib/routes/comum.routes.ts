import { Router, Request, Response } from 'express';
import { autenticar } from '../oauth';
import comumController from '../controllers/comum.controller';
import packageJson from '../../package.json';

const router = Router();

router.get('/', autenticar, (req: Request, res: Response) => {
    res.json({ message: `API TrackBeef ${packageJson.version}` });
});
router.get('/public/estados', comumController.getEstados);
router.get('/public/cidades', comumController.getCidades);
router.get('/public/cep', comumController.getConsultaCEP);
router.get('/public/default-values', comumController.getDefaultValues);


export default router;