import { Router } from 'express';
import empresaController from '../controllers/empresa.controller';
import { autenticar } from '../oauth';
import vendasController from '../controllers/vendas.controller';

const router = Router();


router.get('/v1/admin/produtos/pdv/disponiveis', autenticar, vendasController.getProdutosPDV);
router.get('/v1/admin/produtos/pecas/almoxarifado/disponiveis', autenticar, vendasController.getPecasProdutoAlmoxarifado);

// Vendas
router.get('/v1/admin/vendas/pedidos', autenticar, vendasController.getVendas);
router.get('/v1/admin/vendas/pedidos/:id', autenticar, vendasController.getVendaPorId);
router.get('/v1/admin/vendas/clientes/:id_cliente/precos-praticados', autenticar, vendasController.getPrecosPraticadosCliente);
router.post('/v1/admin/vendas/pedidos', autenticar, vendasController.setVendaPDV);
router.post('/v1/admin/vendas/pedidos/:id/cancelar', autenticar, vendasController.cancelarVenda);
router.post('/v1/admin/vendas/pedidos/:id/desfazer-processamento', autenticar, vendasController.desfazerProcessamentoVenda);


export default router;