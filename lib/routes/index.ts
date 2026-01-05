import { Router } from 'express';
import usuariosRoutes from './usuarios.routes';
import comumRoutes from './comum.routes';
import cronsRoutes from './crons.routes';
import webhookRoutes from './webhook.routes';
import relatoriosRoutes from './relatorios.routes';
import empresaRoutes from './empresa.routes';
import vendaRoutes from './venda.routes';
import financeiroRoutes from './financeiro.routes';
import cdnRoutes from './cdn.routes';

const router = Router();

router.use(comumRoutes);
router.use(usuariosRoutes);
router.use(cronsRoutes);
router.use(webhookRoutes);
router.use(relatoriosRoutes);
router.use(empresaRoutes);
router.use(vendaRoutes);
router.use(financeiroRoutes);
router.use(cdnRoutes);

export default router;