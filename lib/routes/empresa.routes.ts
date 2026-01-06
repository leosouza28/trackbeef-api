import { Router } from 'express';
import empresaController from '../controllers/empresa.controller';
import { autenticar } from '../oauth';

const router = Router();

router.get('/v1/empresa/:id', empresaController.getEmpresaData);
router.get('/v1/empresa/codigo-ativacao/:id', empresaController.getEmpresaByCodigoAtivacao);

router.get('/v1/admin/produtos', autenticar, empresaController.getProdutos);
router.get('/v1/admin/produtos/:id', autenticar, empresaController.getProdutoById);
router.post('/v1/admin/produtos', autenticar, empresaController.postProduto);

router.get('/v1/admin/estoque/entrada-notas', autenticar, empresaController.getEntradaNotas);
router.get('/v1/admin/estoque/entrada-notas/:id', autenticar, empresaController.getEntradaNotaById);
router.post('/v1/admin/estoque/entrada-notas', autenticar, empresaController.postEntradaNota);
router.post('/v1/admin/estoque/entrada-notas/:id/cancelar-fechamento', autenticar, empresaController.cancelarFechamentoNota);
router.delete('/v1/admin/estoque/entrada-notas/:id', autenticar, empresaController.deleteNotaEntradaById);
router.post('/v1/admin/estoque/entrada-avulsa', autenticar, empresaController.addPecaAvulsa);

router.get('/v1/admin/almoxarifados', autenticar, empresaController.getAlmoxarifados);
router.get('/v1/admin/almoxarifados/:id', autenticar, empresaController.getAlmoxarifadoById);
router.post('/v1/admin/almoxarifados', autenticar, empresaController.postAlmoxarifado);
router.get('/v1/admin/almoxarifados/:id/estoque', autenticar, empresaController.getEstoqueByAlmoxarifado);

router.get('/v1/admin/estoque', autenticar, empresaController.getEstoques);
router.get('/v1/admin/estoque/:idproduto', autenticar, empresaController.getEstoqueByProdutoAlmoxarifado);
router.get('/v1/admin/estoque/:idproduto/:idalmoxarifado', autenticar, empresaController.getEstoqueByProdutoAlmoxarifado);

router.get('/v1/admin/formas-pagamento', autenticar, empresaController.getFormasPagamento);
router.get('/v1/admin/formas-pagamento/:id', autenticar, empresaController.getFormaPagamentoById);
router.post('/v1/admin/formas-pagamento', autenticar, empresaController.postFormaPagamento);

router.get('/v1/admin/configuracoes', autenticar, empresaController.getConfiguracoesEmpresa);
router.post('/v1/admin/configuracoes', autenticar, empresaController.postConfiguracoesEmpresa);


export default router;