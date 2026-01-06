import { Router } from 'express';
import financeiroController from '../controllers/financeiro.controller';
import { autenticar } from '../oauth';

const router = Router();

router.get('/v1/admin/caixas', autenticar, financeiroController.getCaixas);
router.get('/v1/admin/caixas/:id', autenticar, financeiroController.getCaixaById);
router.get('/v1/admin/caixas/:id/lancamentos', autenticar, financeiroController.getCaixaLancamentos);
router.post('/v1/admin/caixas', autenticar, financeiroController.postCaixa);

router.get('/v1/admin/contas-receber', autenticar, financeiroController.getContasReceber);
router.post('/v1/admin/contas-receber', autenticar, financeiroController.criarContaReceber);
router.put('/v1/admin/contas-receber/:id/alterar', autenticar, financeiroController.alterarContaReceber);
router.put('/v1/admin/contas-receber/:id/lancamento', autenticar, financeiroController.pagarContaReceber);
router.put('/v1/admin/contas-receber/:id/estornar-lancamento/:id_lancamento', autenticar, financeiroController.estornarLancamentoContaReceber);
router.put('/v1/admin/contas-receber/:id/baixa', autenticar, financeiroController.darBaixaContaReceber);
router.put('/v1/admin/contas-receber/:id/baixa/reverter', autenticar, financeiroController.reverterBaixaContaReceber);

router.get('/v1/admin/contas-pagar', autenticar, financeiroController.getContasPagar);
router.put('/v1/admin/contas-pagar/:id/alterar', autenticar, financeiroController.alterarContaPagar);
router.put('/v1/admin/contas-pagar/:id/lancamento', autenticar, financeiroController.pagarContaPagar);
router.put('/v1/admin/contas-pagar/:id/estornar-lancamento/:id_lancamento', autenticar, financeiroController.estornarLancamentoContaPagar);
router.put('/v1/admin/contas-pagar/:id/baixa', autenticar, financeiroController.darBaixaContaPagar);
router.put('/v1/admin/contas-pagar/:id/baixa/reverter', autenticar, financeiroController.reverterBaixaContaPagar);


router.get('/v1/admin/recebimentos', autenticar, financeiroController.getPainelRecebimentos);
router.get('/v1/admin/recebimentos/:id_cliente', autenticar, financeiroController.getPainelRecebimentosByCliente);
router.post('/v1/admin/recebimentos/lancamento', autenticar, financeiroController.lancarRecebimento);
router.put('/v1/admin/recebimentos/lancamento/:id/estornar', autenticar, financeiroController.estornarRecebimento);
router.get('/v1/admin/recebimentos/lancamentos/:id_cliente', autenticar, financeiroController.getListaRecebimentosByClienteId);


export default router;